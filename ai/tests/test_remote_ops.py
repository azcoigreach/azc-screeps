from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from commander.history import HistoryStore
from commander.remote_ops import RemoteEconomics, evaluate_operation, remote_snapshot
from commander.schemas import Telemetry

from helpers import telemetry_payload


class RemoteOperationTests(unittest.TestCase):
    def test_economics_labels_measured_derived_estimated_and_unknown_values(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            history = HistoryStore(Path(directory) / "db.sqlite")
            baseline = Telemetry.model_validate(telemetry_payload(1000))
            history.save_observation(baseline, "baseline", "material-1")
            payload = telemetry_payload(2000)
            payload["operations"]["remoteMining"][0]["delivery"]["energyDeliveredTotal"] = 33400
            payload["operations"]["remoteMining"][0]["losses"]["creepLossesTotal"] = 3
            current = Telemetry.model_validate(payload)
            history.save_observation(current, "current", "material-2")

            result = RemoteEconomics(history).build(current)
            window = result["W1N2"]["windows"]["1000"]
            self.assertEqual(window["grossEnergyDelivered"], {"value": 18400, "provenance": "MEASURED"})
            self.assertEqual(window["grossDeliveryPer1000Ticks"]["value"], 18400.0)
            self.assertEqual(window["replacementEnergyCost"]["provenance"], "ESTIMATED")
            self.assertEqual(window["reservationCost"]["provenance"], "ESTIMATED")
            self.assertEqual(window["minerReplacementCost"]["provenance"], "ESTIMATED")
            self.assertEqual(window["haulerReplacementCost"]["provenance"], "ESTIMATED")
            self.assertEqual(window["estimatedNetPer1000Ticks"]["provenance"], "ESTIMATED")
            self.assertIn(result["W1N2"]["value"]["quality"], {
                "EXCELLENT", "GOOD", "MARGINAL", "POOR", "LOSING", "UNKNOWN"
            })
            self.assertEqual(window["operationalUptimePercent"]["provenance"], "DERIVED")
            history.close()

    def test_outcomes_use_observed_metrics_and_persist_action_and_evaluation_journal(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            history = HistoryStore(Path(directory) / "db.sqlite")
            baseline_telemetry = Telemetry.model_validate(telemetry_payload(1000))
            baseline = remote_snapshot(baseline_telemetry, "W1N2")
            assert baseline is not None
            baseline["energyWaiting"] = 5000
            history.create_operation(
                "op-1", "cmd-1", "ENERGY_BACKLOG; HAULER_SHORTAGE", "W1N2",
                "REBALANCE_REMOTE_LOGISTICS", "Reduce a confirmed backlog", 0.9,
                1000, baseline, "reduce backlog and sustain delivery", 1500,
            )
            history.mark_operation_executed("cmd-1", 1010)

            payload = telemetry_payload(1600)
            remote = payload["operations"]["remoteMining"][0]
            remote["mining"]["containerEnergy"] = 1000
            remote["mining"]["droppedEnergy"] = 500
            remote["mining"]["energyWaiting"] = 1500
            remote["delivery"]["energyDeliveredTotal"] = 18000
            current = Telemetry.model_validate(payload)
            operation = history.due_operations(1600)[0]
            outcome, result, reason = evaluate_operation(operation, current)
            self.assertEqual(outcome, "SUCCESS")
            self.assertEqual(result["backlogReduction"], 3500)
            history.complete_operation("op-1", 1600, outcome, result, reason)
            saved = history.recent_operations()[0]
            self.assertEqual(saved["outcome"], "SUCCESS")
            entry_types = {entry["entry_type"] for entry in history.recent_journal()}
            self.assertIn("commander_action", entry_types)
            self.assertIn("commander_evaluation", entry_types)
            history.close()

    def test_infrastructure_reservation_and_inconclusive_outcomes(self) -> None:
        telemetry = Telemetry.model_validate(telemetry_payload(2000))
        baseline = remote_snapshot(telemetry, "W1N2")
        assert baseline is not None
        baseline["containerSites"] = -1
        operation = {"room": "W1N2", "action": "ENSURE_REMOTE_INFRASTRUCTURE", "baseline": baseline}
        self.assertEqual(evaluate_operation(operation, telemetry)[0], "SUCCESS")

        baseline = remote_snapshot(telemetry, "W1N2")
        assert baseline is not None
        baseline["reservationTicks"] = 100
        operation = {"room": "W1N2", "action": "ENSURE_REMOTE_RESERVATION", "baseline": baseline}
        self.assertEqual(evaluate_operation(operation, telemetry)[0], "SUCCESS")

        operation = {"room": "W9N9", "action": "REASSESS_REMOTE", "baseline": {}}
        self.assertEqual(evaluate_operation(operation, telemetry)[0], "INCONCLUSIVE")


if __name__ == "__main__":
    unittest.main()
