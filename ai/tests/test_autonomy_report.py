from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from commander.autonomy import AutonomyController
from commander.history import HistoryStore
from commander.report import build_report
from commander.schemas import StrategicOrder, Telemetry
from tests.helpers import telemetry_payload


class FakeTransport:
    def __init__(self, history: HistoryStore, tick: int) -> None:
        self.history = history
        self.tick = tick
        self.sent: list[StrategicOrder] = []

    def send_safe_command(self, action, parameters=None, *, reason):
        order = StrategicOrder(
            schemaVersion=1, id=f"test-{len(self.sent)}", createdTick=self.tick,
            expiresTick=self.tick + 1000, action=action, parameters=parameters or {}, reason=reason,
        )
        self.history.record_command(order, "sent")
        self.sent.append(order)
        return order


class AutonomyReportTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.history = HistoryStore(Path(self.temp.name) / "history.db")

    def tearDown(self) -> None:
        self.history.close()
        self.temp.cleanup()

    def test_deterministic_maintenance_selects_obvious_diagnostic_without_llm(self) -> None:
        payload = telemetry_payload()
        payload["authority"]["mode"] = "execute"
        payload["authority"]["execution"]["autoRemoteMaintenance"] = True
        payload["operations"]["remoteMining"][0]["diagnostics"] = [
            {"diagnostic": "RESERVATION_EXPIRING", "severity": "HIGH", "evidence": {"ticksToEnd": 100}}
        ]
        payload["operations"]["remoteMining"][0]["reasons"] = ["RESERVATION_EXPIRING"]
        telemetry = Telemetry.model_validate(payload)
        transport = FakeTransport(self.history, telemetry.tick)
        order = AutonomyController(self.history, transport).run(telemetry)
        self.assertIsNotNone(order)
        self.assertEqual(order.action, "ENSURE_REMOTE_RESERVATION")
        self.assertEqual(order.parameters, {"room": "W1N2"})
        self.assertEqual(self.history.recent_operations()[0]["action"], "ENSURE_REMOTE_RESERVATION")

    def test_active_remote_objective_prevents_duplicate_maintenance_order(self) -> None:
        payload = telemetry_payload()
        payload["authority"]["mode"] = "execute"
        payload["authority"]["execution"]["autoRemoteMaintenance"] = True
        remote = payload["operations"]["remoteMining"][0]
        remote["diagnostics"] = [{
            "diagnostic": "RESERVATION_EXPIRING", "severity": "HIGH", "evidence": {"ticksToEnd": 100}
        }]
        remote["reasons"] = ["RESERVATION_EXPIRING"]
        remote["objectives"] = ["reservation"]
        telemetry = Telemetry.model_validate(payload)
        transport = FakeTransport(self.history, telemetry.tick)
        self.assertIsNone(AutonomyController(self.history, transport).run(telemetry))
        self.assertEqual(transport.sent, [])

    def test_autonomous_scouting_is_bounded_and_resolves_unknown_intel(self) -> None:
        payload = telemetry_payload()
        payload["authority"]["mode"] = "execute"
        payload["authority"]["execution"]["autoScouting"] = True
        telemetry = Telemetry.model_validate(payload)
        transport = FakeTransport(self.history, telemetry.tick)
        order = AutonomyController(self.history, transport).run(telemetry)
        self.assertEqual(order.action, "SCOUT_ROOM")
        self.assertEqual(order.parameters["room"], "W0N1")
        payload["operations"]["scouting"] = [{
            "id": "active", "orderId": "active", "origin": "W1N1", "room": "W0N1",
            "status": "EN_ROUTE", "createdTick": telemetry.tick, "requestedTick": telemetry.tick,
            "observedTick": None, "completedTick": None, "intelLastSeenTick": None,
            "scoutCreep": "scou:test", "activeScouts": 1, "failureReason": None,
        }]
        telemetry = Telemetry.model_validate(payload)
        # A fresh controller uses an empty history to isolate the concurrency gate.
        other_history = HistoryStore(Path(self.temp.name) / "other.db")
        try:
            self.assertIsNone(AutonomyController(other_history, FakeTransport(other_history, telemetry.tick)).run(telemetry))
        finally:
            other_history.close()

    def test_periodic_report_includes_operations_economics_intel_and_cost(self) -> None:
        telemetry = Telemetry.model_validate(telemetry_payload())
        report = build_report(self.history, telemetry, 24)
        self.assertIn("COMMANDER OPERATIONS BRIEFING", report)
        self.assertIn("Remote performance", report)
        self.assertIn("Territorial intelligence", report)
        self.assertIn("Expansion planning", report)
        self.assertIn("API cost", report)


if __name__ == "__main__":
    unittest.main()
