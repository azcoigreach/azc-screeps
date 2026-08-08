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

    def test_safe_action_and_parameter_whitelists(self) -> None:
        fake = FakeScreepsClient(json.dumps(telemetry_payload()), json.dumps(status_payload()))
        transport = CommanderTransport(fake, self.history, self.config)
        transport.poll()
        with self.assertRaises(TransportError):
            transport.send_safe_command("COLONIZE_ROOM", reason="forbidden")
        with self.assertRaises(TransportError):
            transport.send_safe_command("SET_EXPLANATION", {"explanation": ""}, reason="invalid")

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


if __name__ == "__main__":
    unittest.main()
