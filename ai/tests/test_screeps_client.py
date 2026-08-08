from __future__ import annotations

import io
import json
import socket
import unittest
from email.message import Message
from urllib.error import HTTPError

from commander.screeps_client import ScreepsAPIClient, ScreepsAPIError


class FakeResponse:
    def __init__(self, payload: dict, status: int = 200, headers: Message | None = None) -> None:
        self.payload = json.dumps(payload).encode()
        self.status = status
        self.headers = headers or Message()

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self) -> bytes:
        return self.payload


class SequenceOpener:
    def __init__(self, items):
        self.items = list(items)
        self.requests = []

    def __call__(self, request, timeout):
        self.requests.append((request, timeout))
        item = self.items.pop(0)
        if isinstance(item, BaseException):
            raise item
        return item


def http_error(status: int, body: bytes = b"{}", headers: Message | None = None) -> HTTPError:
    return HTTPError("https://screeps.invalid/api", status, "error", headers or Message(), io.BytesIO(body))


class ScreepsClientTests(unittest.TestCase):
    def test_auth_header_and_segment_query(self) -> None:
        opener = SequenceOpener([FakeResponse({"ok": 1, "data": "telemetry"})])
        client = ScreepsAPIClient("top-secret", opener=opener)
        self.assertEqual(client.read_segment(90, shard="shard1"), "telemetry")
        request, timeout = opener.requests[0]
        self.assertEqual(request.get_header("X-token"), "top-secret")
        self.assertNotIn("top-secret", request.full_url)
        self.assertIn("segment=90", request.full_url)
        self.assertIn("shard=shard1", request.full_url)
        self.assertEqual(timeout, 10.0)

    def test_branch_shape_and_active_world(self) -> None:
        payload = {
            "ok": 1,
            "list": [
                {"branch": "default", "activeWorld": True, "activeSim": False},
                {"branch": "ai-test", "activeWorld": False, "activeSim": False},
            ],
        }
        client = ScreepsAPIClient("secret", opener=SequenceOpener([FakeResponse(payload)]))
        self.assertEqual(client.active_world_branch(), "default")

    def test_retries_429_and_honors_retry_after(self) -> None:
        headers = Message()
        headers["Retry-After"] = "2"
        opener = SequenceOpener([http_error(429, headers=headers), FakeResponse({"ok": 1, "status": "normal"})])
        sleeps = []
        client = ScreepsAPIClient("secret", opener=opener, sleeper=sleeps.append, max_retries=1)
        self.assertEqual(client.world_status(), "normal")
        self.assertEqual(sleeps, [2.0])

    def test_retries_timeout_with_bounded_backoff(self) -> None:
        opener = SequenceOpener([socket.timeout(), FakeResponse({"ok": 1, "status": "normal"})])
        sleeps = []
        client = ScreepsAPIClient(
            "secret", opener=opener, sleeper=sleeps.append, random_source=lambda: 0, max_retries=1
        )
        self.assertEqual(client.world_status(), "normal")
        self.assertEqual(sleeps, [0.5])

    def test_does_not_retry_permanent_client_error(self) -> None:
        opener = SequenceOpener([http_error(400)])
        client = ScreepsAPIClient("secret", opener=opener, sleeper=lambda _delay: None)
        with self.assertRaises(ScreepsAPIError) as context:
            client.world_status()
        self.assertFalse(context.exception.transient)
        self.assertEqual(len(opener.requests), 1)

    def test_captures_rate_limit_headers(self) -> None:
        headers = Message()
        headers["X-RateLimit-Limit"] = "360"
        headers["X-RateLimit-Remaining"] = "359"
        headers["X-RateLimit-Reset"] = "2000000000"
        client = ScreepsAPIClient(
            "secret", opener=SequenceOpener([FakeResponse({"ok": 1, "data": None}, headers=headers)])
        )
        client.read_segment(90)
        self.assertEqual(client.last_rate_limit.remaining, 359)

    def test_segment_size_and_id_are_validated_before_network(self) -> None:
        client = ScreepsAPIClient("secret", opener=SequenceOpener([]))
        with self.assertRaises(ValueError):
            client.read_segment(100)
        with self.assertRaises(ValueError):
            client.write_segment(91, "x" * (100 * 1024 + 1))


if __name__ == "__main__":
    unittest.main()
