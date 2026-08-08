from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from commander.history import HistoryStore
from commander.observer import ObservationProcessor
from commander.review_scheduler import ReviewScheduler

from tests.helpers import telemetry_payload


class ReviewSchedulerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.history = HistoryStore(Path(self.temp.name) / "history.db")
        self.processor = ObservationProcessor(self.history)
        self.scheduler = ReviewScheduler(
            self.history,
            min_interval_seconds=900,
            max_idle_interval_seconds=3600,
            debounce_seconds=120,
        )
        self.now = 100_000.0

    def tearDown(self) -> None:
        self.history.close()
        self.temp.cleanup()

    def process(self, payload: dict):
        return self.processor.process(json.dumps(payload))

    def establish_reviewed_baseline(self):
        payload = telemetry_payload(1000)
        update = self.process(payload)
        self.assertFalse(self.scheduler.evaluate(update, self.now).should_review)
        unchanged = self.process(payload)
        decision = self.scheduler.evaluate(unchanged, self.now + 120)
        self.assertTrue(decision.should_review)
        self.scheduler.mark_success(decision.strategic_hash, now_epoch=self.now + 120)
        return payload

    def test_material_events_debounce_coalesce_and_obey_minimum_interval(self) -> None:
        payload = self.establish_reviewed_baseline()
        changed = json.loads(json.dumps(payload))
        changed["tick"] += 1
        changed["colonies"]["W1N1"]["population"]["state"] = "REPLACEMENT_PENDING"
        update = self.process(changed)
        decision = self.scheduler.evaluate(update, self.now + 200)
        self.assertFalse(decision.should_review)
        self.assertTrue(any(event.key.startswith("population:") for event in decision.events))

        changed_again = json.loads(json.dumps(changed))
        changed_again["tick"] += 1
        changed_again["operations"]["remoteMining"][0]["health"] = "DEGRADED"
        decision = self.scheduler.evaluate(self.process(changed_again), self.now + 300)
        self.assertFalse(decision.should_review)

        unchanged = self.process(changed_again)
        decision = self.scheduler.evaluate(unchanged, self.now + 1020)
        self.assertTrue(decision.should_review)
        self.assertEqual(decision.reason, "coalesced material events")
        self.assertGreaterEqual(len(decision.events), 2)
        metrics = self.history.cost_summary()
        self.assertGreaterEqual(metrics["events_coalesced"], 1)

    def test_urgent_owned_room_hostiles_bypass_success_cadence(self) -> None:
        payload = self.establish_reviewed_baseline()
        attacked = json.loads(json.dumps(payload))
        attacked["tick"] += 1
        attacked["colonies"]["W1N1"]["defense"]["hostileCreeps"] = 2
        decision = self.scheduler.evaluate(self.process(attacked), self.now + 180)
        self.assertTrue(decision.should_review)
        self.assertEqual(decision.reason, "urgent strategic event")
        self.assertTrue(any(event.priority == "URGENT" for event in decision.events))

    def test_restart_preserves_last_review_and_periodic_fallback(self) -> None:
        payload = self.establish_reviewed_baseline()
        restarted = ReviewScheduler(
            self.history,
            min_interval_seconds=900,
            max_idle_interval_seconds=3600,
            debounce_seconds=120,
        )
        quiet = self.process({**payload, "tick": payload["tick"] + 1})
        self.assertFalse(restarted.evaluate(quiet, self.now + 200).should_review)
        periodic = restarted.evaluate(self.process({**payload, "tick": payload["tick"] + 2}), self.now + 3720)
        self.assertTrue(periodic.should_review)
        self.assertEqual(periodic.reason, "maximum idle interval reached")

    def test_state_hash_deduplicates_a_transient_reversal(self) -> None:
        payload = self.establish_reviewed_baseline()
        changed = json.loads(json.dumps(payload))
        changed["tick"] += 1
        changed["operations"]["remoteMining"][0]["health"] = "DEGRADED"
        self.scheduler.evaluate(self.process(changed), self.now + 200)

        restored = json.loads(json.dumps(payload))
        restored["tick"] += 2
        decision = self.scheduler.evaluate(self.process(restored), self.now + 300)
        self.assertFalse(decision.should_review)
        self.assertEqual(decision.events, ())
        self.assertGreaterEqual(self.history.cost_summary()["reviews_suppressed"], 1)

    def test_failed_urgent_review_backs_off_for_minimum_interval(self) -> None:
        payload = self.establish_reviewed_baseline()
        attacked = json.loads(json.dumps(payload))
        attacked["tick"] += 1
        attacked["colonies"]["W1N1"]["defense"]["hostileCreeps"] = 1
        decision = self.scheduler.evaluate(self.process(attacked), self.now + 180)
        self.assertTrue(decision.should_review)
        self.scheduler.mark_failure("provider unavailable", now_epoch=self.now + 180)
        self.assertFalse(
            self.scheduler.evaluate(self.process(attacked), self.now + 300).should_review
        )

    def test_critical_colonization_failure_is_urgent(self) -> None:
        payload = self.establish_reviewed_baseline()
        failed = json.loads(json.dumps(payload))
        failed["tick"] += 1
        failed["operations"]["colonizations"] = [{
            "id": "colonization:cmd-1", "orderId": "cmd-1", "from": "W1N1",
            "origin": "W1N1", "target": "W1N2", "state": "FAILED",
            "outcome": "FAILED", "createdTick": 1000, "updatedTick": 1001,
            "failureReason": "claimer lost",
        }]
        decision = self.scheduler.evaluate(self.process(failed), self.now + 180)
        self.assertTrue(decision.should_review)
        self.assertEqual(decision.reason, "urgent strategic event")
        self.assertTrue(any(event.key == "colonizations:W1N2:FAILED" for event in decision.events))


if __name__ == "__main__":
    unittest.main()
