from __future__ import annotations

import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from pydantic import ValidationError

from commander.history import HistoryStore
from commander.main import show_cost, show_journal
from commander.observer import ObservationProcessor
from commander.schemas import Advisory, Telemetry
from commander.trends import TrendAnalyzer

from helpers import telemetry_payload
from test_openai_advisor import advisory


class TrendsJournalTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.history = HistoryStore(Path(self.temp.name) / "commander.db")
        self.processor = ObservationProcessor(self.history)

    def tearDown(self) -> None:
        self.history.close()
        self.temp.cleanup()

    def test_calculates_storage_controller_cpu_and_remote_counter_deltas(self) -> None:
        baseline = telemetry_payload(1000)
        current = telemetry_payload(6000)
        current["colonies"]["W1N1"]["energy"]["storageEnergy"] += 84202
        current["colonies"]["W1N1"]["controller"]["progress"] += 25000
        current["empire"]["gcl"]["progress"] += 10000.0
        current["empire"]["creeps"] += 2
        current["cpu"]["bucket"] = 8500
        current["operations"]["remoteMining"][0]["delivery"]["energyDeliveredTotal"] += 52300
        current["operations"]["remoteMining"][0]["losses"]["creepLossesTotal"] += 2

        self.processor.process(json.dumps(baseline))
        update = self.processor.process(json.dumps(current))
        trend = TrendAnalyzer(self.history).build(update.telemetry)["windows"]["5000"]

        self.assertTrue(trend["available"])
        self.assertEqual(trend["spanTicks"], 5000)
        self.assertFalse(trend["partialWindow"])
        self.assertEqual(trend["colonies"]["W1N1"]["storageEnergy"]["netChange"], 84202)
        self.assertEqual(trend["colonies"]["W1N1"]["controller"]["progressDeltaAtSameRcl"], 25000)
        self.assertEqual(trend["remotes"]["W1N2"]["grossEnergyDelivered"], 52300)
        self.assertEqual(trend["remotes"]["W1N2"]["deliveryPer1000Ticks"], 10460.0)
        self.assertEqual(trend["remotes"]["W1N2"]["creepLosses"], 2)
        self.assertEqual(trend["empire"]["gclProgressDeltaAtSameLevel"], 10000.0)
        self.assertEqual(trend["empire"]["creepDelta"], 2)
        self.assertIn("gross measured delivery", TrendAnalyzer(self.history).build(update.telemetry)["dataProvenance"])
        self.assertIn("net colony balance", TrendAnalyzer(self.history).build(update.telemetry)["dataProvenance"])
        early = TrendAnalyzer(self.history).build(update.telemetry)["windows"]["20000"]
        self.assertTrue(early["available"])
        self.assertTrue(early["partialWindow"])
        self.assertEqual(early["baselineTick"], 1000)

    def test_room_intelligence_staleness_candidates_and_readiness_enum_parse_strictly(self) -> None:
        payload = telemetry_payload()
        payload["intelligence"]["knownRooms"][0]["intelAgeTicks"] = 12000
        payload["intelligence"]["knownRooms"][0]["stale"] = True
        payload["intelligence"]["staleRooms"] = ["W1N2"]
        telemetry = Telemetry.model_validate(payload)
        self.assertTrue(telemetry.intelligence.knownRooms[0].stale)
        self.assertEqual(telemetry.expansionCandidates[0].factors["sources"], 40)
        self.assertEqual(advisory().expansion_readiness, "INSUFFICIENT_INTEL")

        bad = advisory().model_dump()
        bad["expansion_readiness"] = True
        with self.assertRaises(ValidationError):
            Advisory.model_validate(bad)

    def test_journal_events_render_and_costs_aggregate(self) -> None:
        baseline = telemetry_payload(1000)
        current = telemetry_payload(2000)
        current["colonies"]["W1N1"]["controller"]["rcl"] = 7
        current["colonies"]["W1N1"]["energy"]["storageEnergy"] = 275000
        self.processor.process(json.dumps(baseline))
        self.processor.process(json.dumps(current))

        item = advisory()
        self.history.save_recommendation(
            "adv-1", 2000, "gpt-5.4-nano", item,
            {"input_tokens": 1000, "output_tokens": 200, "total_tokens": 1200}, 0.00045,
        )
        self.history.save_recommendation(
            "adv-2", 2100, "gpt-5.4-nano", item,
            {"input_tokens": 500, "output_tokens": 100, "total_tokens": 600}, 0.000225,
        )
        entries = self.history.recent_journal(20)
        types = {entry["entry_type"] for entry in entries}
        self.assertIn("telemetry_baseline", types)
        self.assertIn("rcl_increased", types)
        self.assertIn("storage_threshold", types)
        self.assertIn("ai_review", types)

        output = io.StringIO()
        with redirect_stdout(output):
            show_journal(self.history, 20, 1500)
        self.assertIn("AZC COLONY JOURNAL", output.getvalue())
        self.assertIn("AI strategic review", output.getvalue())
        self.assertNotIn("Strategic telemetry baseline established", output.getvalue())

        cost = self.history.cost_summary()
        self.assertEqual(cost["advisories"], 2)
        self.assertAlmostEqual(float(cost["lifetime"]), 0.000675)
        output = io.StringIO()
        with redirect_stdout(output):
            show_cost(self.history)
        self.assertIn("$0.000675", output.getvalue())

    def test_protection_expiration_creates_a_major_journal_chapter(self) -> None:
        baseline = telemetry_payload(1000)
        current = telemetry_payload(2000)
        event = {
            "id": "protection:PROTECTION_EXPIRED:2000",
            "type": "PROTECTION_EXPIRED",
            "tick": 2000,
            "timestamp": 1770000000000,
            "message": "Protected-area boundary expired; routes and strategy require full recomputation",
            "details": {"previousStatus": "novice"},
        }
        current["empire"]["protection"].update({
            "active": False, "status": "normal", "expirationTimestamp": None,
            "remainingProtectionMs": None, "currentRegionKey": None,
            "protectedOwnedRooms": 0, "currentProtectionClaimSlots": 3,
            "claimLimit": None, "threshold": "INACTIVE", "advisoryRequired": True,
            "lastTransitionTick": 2000, "events": [event],
        })
        current["empire"]["gcl"]["currentProtectionClaimSlots"] = 3
        self.processor.process(json.dumps(baseline))
        self.processor.process(json.dumps(current))
        entries = self.history.recent_journal(20)
        expiration = next(entry for entry in entries if entry["entry_type"] == "protection_expired")
        self.assertIn("new strategic era", expiration["title"])
        self.assertIn("reconsider deferred scouts", expiration["narrative"])

    def test_first_phase3_snapshot_after_legacy_history_creates_only_a_baseline(self) -> None:
        legacy = telemetry_payload(900)
        legacy["schemaVersion"] = 1
        self.history.connection.execute(
            """
            INSERT INTO observations (
                recorded_at, screeps_tick, shard, telemetry_hash, material_hash,
                rcl, owned_room_count, creep_count, cpu_used, cpu_bucket, gcl,
                credits, remote_mining_summary, hostile_count, empire_summary, telemetry_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "2026-08-07T00:00:00+00:00", 900, "shard0", "legacy", "legacy",
                6, 1, 30, 12.5, 9000, 4, 12345.0, "[]", 0, "{}",
                json.dumps(legacy),
            ),
        )
        self.history.connection.commit()

        self.processor.process(json.dumps(telemetry_payload(1000)))
        entries = self.history.recent_journal(20)
        self.assertEqual([entry["entry_type"] for entry in entries], ["telemetry_baseline"])


if __name__ == "__main__":
    unittest.main()
