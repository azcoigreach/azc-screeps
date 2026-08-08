from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from commander.history import HistoryStore
from commander.observer import ObservationProcessor, TelemetryError
from commander.schemas import Telemetry
from commander.transport import CommanderTransport, TransportError

from helpers import config, status_payload, telemetry_payload


class FakeScreepsClient:
    def __init__(self, telemetry: str | None = None, status: str | None = None) -> None:
        self.telemetry = telemetry
        self.status = status
        self.writes = []

    def read_segment(self, segment: int):
        return self.telemetry if segment == 90 else self.status

    def write_segment(self, segment: int, data: str):
        self.writes.append((segment, data))


class TransportHistoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp.name) / "commander.db"
        self.history = HistoryStore(self.db_path)
        self.config = config(self.db_path)

    def tearDown(self) -> None:
        self.history.close()
        self.temp.cleanup()

    def test_observation_validation_change_detection_and_sqlite_fields(self) -> None:
        processor = ObservationProcessor(self.history)
        raw = json.dumps(telemetry_payload())
        first = processor.process(raw)
        second = processor.process(raw)
        self.assertTrue(first.is_new)
        self.assertTrue(first.material_change)
        self.assertFalse(second.is_new)
        row = self.history.latest_observation()
        self.assertEqual(row["owned_room_count"], 1)
        self.assertEqual(row["rcl"], 6)
        self.assertEqual(row["hostile_count"], 0)
        self.assertEqual(len(json.loads(row["remote_mining_summary"])), 3)

    def test_malformed_telemetry_is_rejected(self) -> None:
        with self.assertRaises(TelemetryError):
            ObservationProcessor(self.history).process('{"schemaVersion":1}')

    def test_material_hash_serializes_active_scout_lifecycle(self) -> None:
        payload = telemetry_payload()
        payload["operations"]["scouting"] = [{
            "id": "ai-scout:cmd-1",
            "orderId": "cmd-1",
            "origin": "W1N1",
            "room": "W0N1",
            "status": "SPAWNING",
            "createdTick": 12345,
            "requestedTick": 12345,
            "observedTick": None,
            "completedTick": None,
            "intelLastSeenTick": None,
            "scoutCreep": None,
            "activeScouts": 0,
            "failureReason": None,
        }]

        update = ObservationProcessor(self.history).process(json.dumps(payload))

        self.assertTrue(update.material_change)
        self.assertEqual(update.telemetry.operations.scouting[0].status, "SPAWNING")

    def test_protection_countdown_only_becomes_material_at_thresholds(self) -> None:
        baseline = telemetry_payload(12345)
        current = json.loads(json.dumps(baseline))
        current["tick"] = 12346
        current["empire"]["protection"]["remainingProtectionMs"] -= 1000
        self.processor = ObservationProcessor(self.history)
        self.processor.process(json.dumps(baseline))
        update = self.processor.process(json.dumps(current))
        self.assertTrue(update.is_new)
        self.assertFalse(update.material_change)

        current["tick"] += 1
        current["empire"]["protection"]["threshold"] = "AT_OR_BELOW_72_HOURS"
        threshold = self.processor.process(json.dumps(current))
        self.assertTrue(threshold.material_change)

    def test_unique_command_serialization_and_acknowledgement(self) -> None:
        fake = FakeScreepsClient(
            json.dumps(telemetry_payload()), json.dumps(status_payload())
        )
        transport = CommanderTransport(fake, self.history, self.config)
        transport.poll()
        first = transport.send_safe_command("REQUEST_STATUS", reason="test")
        envelope = json.loads(fake.writes[-1][1])
        self.assertEqual(envelope["orders"][0]["id"], first.id)
        self.assertEqual(envelope["orders"][0]["action"], "REQUEST_STATUS")
        with self.assertRaisesRegex(TransportError, "awaiting acknowledgement"):
            transport.send_safe_command("NOOP", reason="would overwrite")

        fake.status = json.dumps(status_payload(results=[{
            "id": first.id,
            "action": "REQUEST_STATUS",
            "status": "completed",
            "message": "Status published to segment 92",
            "reason": None,
            "tick": 12346,
        }]))
        transport.poll()
        self.assertEqual(self.history.recent_commands()[0]["state"], "completed")
        second = transport.send_safe_command("NOOP", reason="second")
        self.assertNotEqual(first.id, second.id)

    def test_heartbeat_never_overwrites_pending_order(self) -> None:
        fake = FakeScreepsClient(json.dumps(telemetry_payload()), json.dumps(status_payload()))
        transport = CommanderTransport(fake, self.history, self.config)
        transport.poll()
        transport.send_safe_command("NOOP", reason="pending")
        write_count = len(fake.writes)
        self.assertFalse(transport.heartbeat())
        self.assertEqual(len(fake.writes), write_count)

    def test_active_order_acknowledgement_releases_heartbeat(self) -> None:
        payload = telemetry_payload()
        fake = FakeScreepsClient(json.dumps(payload), json.dumps(status_payload()))
        transport = CommanderTransport(fake, self.history, self.config)
        transport.poll()
        order = transport.send_safe_command(
            "SCOUT_ROOM", {"room": "W0N1", "origin": "W1N1"}, reason="test scout"
        )
        status = status_payload()
        status["orders"]["active"] = 1
        status["orders"]["activeOrders"] = [{
            "id": order.id, "action": "SCOUT_ROOM", "startedTick": payload["tick"]
        }]
        fake.status = json.dumps(status)
        transport.poll()
        self.assertEqual(self.history.recent_commands(1)[0]["state"], "active")
        self.assertTrue(transport.heartbeat())

    def test_safe_action_and_parameter_whitelists(self) -> None:
        fake = FakeScreepsClient(json.dumps(telemetry_payload()), json.dumps(status_payload()))
        transport = CommanderTransport(fake, self.history, self.config)
        transport.poll()
        with self.assertRaises(TransportError):
            transport.send_safe_command("ATTACK_ROOM", reason="forbidden")
        with self.assertRaises(TransportError):
            transport.send_safe_command("SET_EXPLANATION", {"explanation": ""}, reason="invalid")

    def test_new_remote_and_colonization_commands_have_narrow_parameters(self) -> None:
        fake = FakeScreepsClient(json.dumps(telemetry_payload()), json.dumps(status_payload()))
        transport = CommanderTransport(fake, self.history, self.config)
        transport.poll()
        command = transport.send_safe_command(
            "START_REMOTE_MINING", {"origin": "W1N1", "target": "W1N2"}, reason="eligible candidate"
        )
        self.assertEqual(command.action, "START_REMOTE_MINING")
        self.history.update_command(command.id, "completed")
        colonize = transport.send_safe_command(
            "COLONIZE_ROOM",
            {"origin": "W1N1", "target": "W1N2", "layout": {"name": "def_hor", "origin": {"x": 20, "y": 20}}},
            reason="human validated claim",
        )
        self.assertEqual(colonize.parameters["layout"]["name"], "def_hor")

    def test_scouting_command_serialization_and_validation(self) -> None:
        fake = FakeScreepsClient(json.dumps(telemetry_payload()), json.dumps(status_payload()))
        transport = CommanderTransport(fake, self.history, self.config)
        transport.poll()
        scout = transport.send_safe_command(
            "SCOUT_ROOM", {"room": "W1N2", "origin": "W1N1"}, reason="refresh intelligence"
        )
        envelope = json.loads(fake.writes[-1][1])
        self.assertEqual(scout.action, "SCOUT_ROOM")
        self.assertEqual(envelope["orders"][0]["parameters"], {"room": "W1N2", "origin": "W1N1"})

        self.history.update_command(scout.id, "completed")
        with self.assertRaisesRegex(TransportError, "valid room and origin"):
            transport.send_safe_command(
                "SCOUT_ROOM", {"room": "invalid", "origin": "W1N1"}, reason="invalid"
            )

    def test_operational_authority_command_is_narrow_and_enum_validated(self) -> None:
        fake = FakeScreepsClient(json.dumps(telemetry_payload()), json.dumps(status_payload()))
        transport = CommanderTransport(fake, self.history, self.config)
        transport.poll()
        command = transport.send_safe_command(
            "SET_OPERATIONAL_AUTHORITY",
            {"scouting": "AUTO", "remoteMaintenance": "OFF"},
            reason="human policy change",
        )
        self.assertEqual(command.parameters["scouting"], "AUTO")
        self.history.update_command(command.id, "completed")
        with self.assertRaisesRegex(TransportError, "OFF, MANUAL, or AUTO"):
            transport.send_safe_command(
                "SET_OPERATIONAL_AUTHORITY",
                {"scouting": "ALL", "remoteMaintenance": "OFF"},
                reason="invalid",
            )

        mode = transport.send_safe_command(
            "SET_EXECUTION_MODE", {"mode": "execute"}, reason="human mode change"
        )
        self.assertEqual(mode.parameters, {"mode": "execute"})
        self.history.update_command(mode.id, "completed")
        with self.assertRaisesRegex(TransportError, "observe or execute"):
            transport.send_safe_command(
                "SET_EXECUTION_MODE", {"mode": "unsafe"}, reason="invalid"
            )

    def test_rejected_command_closes_linked_operation_as_failed(self) -> None:
        fake = FakeScreepsClient(json.dumps(telemetry_payload()), json.dumps(status_payload()))
        transport = CommanderTransport(fake, self.history, self.config)
        transport.poll()
        command = transport.send_safe_command(
            "REBALANCE_REMOTE_LOGISTICS", {"room": "W1N2"}, reason="confirmed backlog"
        )
        self.history.create_operation(
            "op-rejected", command.id, "ENERGY_BACKLOG", "W1N2",
            command.action, command.reason, 0.9, 12345, {}, "reduce backlog", 13345,
        )
        fake.status = json.dumps(status_payload(results=[{
            "id": command.id,
            "action": command.action,
            "status": "rejected",
            "message": "Execution gate closed",
            "reason": "remote maintenance authority is off",
            "tick": 12346,
        }]))

        transport.poll()

        operation = self.history.recent_operations()[0]
        self.assertEqual(operation["outcome"], "FAILED")
        self.assertEqual(operation["result"], {"commandStatus": "rejected"})
        self.assertEqual(operation["outcome_reason"], "remote maintenance authority is off")


if __name__ == "__main__":
    unittest.main()
