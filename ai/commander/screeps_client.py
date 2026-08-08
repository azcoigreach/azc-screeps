"""Small, reusable client for the Screeps HTTP API.

Screeps documents token authentication, rate limits, code upload, and the
endpoint names. Some branch response/request fields remain undocumented; the
shapes here match the live MMO API and the maintained screepts client.
"""

from __future__ import annotations

import json
import random
import socket
import time
from dataclasses import dataclass
from email.message import Message
from typing import Any, Callable, Mapping
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


TRANSIENT_STATUSES = {429, 500, 502, 503, 504}


@dataclass(frozen=True)
class RateLimit:
    limit: int | None
    remaining: int | None
    reset_epoch: int | None


class ScreepsAPIError(RuntimeError):
    """A sanitized Screeps API failure that never includes credentials."""

    def __init__(
        self,
        message: str,
        *,
        status: int | None = None,
        transient: bool = False,
        retry_after: float | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.transient = transient
        self.retry_after = retry_after


class ScreepsAPIClient:
    """Screeps API client with bounded retries and rate-limit awareness."""

    def __init__(
        self,
        token: str,
        *,
        base_url: str = "https://screeps.com",
        shard: str = "shard0",
        timeout: float = 10.0,
        max_retries: int = 3,
        backoff_seconds: float = 0.5,
        max_backoff_seconds: float = 15.0,
        opener: Callable[..., Any] | None = None,
        sleeper: Callable[[float], None] = time.sleep,
        random_source: Callable[[], float] = random.random,
        clock: Callable[[], float] = time.time,
    ) -> None:
        if not token:
            raise ValueError("SCREEPS_API_TOKEN is required")
        if timeout <= 0:
            raise ValueError("timeout must be positive")
        if max_retries < 0:
            raise ValueError("max_retries cannot be negative")
        self._token = token
        self.base_url = base_url.rstrip("/")
        self.shard = shard
        self.timeout = timeout
        self.max_retries = max_retries
        self.backoff_seconds = backoff_seconds
        self.max_backoff_seconds = max_backoff_seconds
        self._open = opener or urlopen
        self._sleep = sleeper
        self._random = random_source
        self._clock = clock
        self.last_rate_limit = RateLimit(None, None, None)
        self._rate_limits: dict[tuple[str, str], RateLimit] = {}

    def _request(
        self,
        method: str,
        path: str,
        *,
        query: Mapping[str, Any] | None = None,
        payload: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        url = f"{self.base_url}{path}"
        if query:
            clean_query = {key: value for key, value in query.items() if value is not None}
            url = f"{url}?{urlencode(clean_query)}"
        body = None if payload is None else json.dumps(payload, separators=(",", ":")).encode("utf-8")
        headers = {
            "Accept": "application/json",
            "X-Token": self._token,
            "User-Agent": "azc-screeps-ai-commander/0.1",
        }
        if body is not None:
            headers["Content-Type"] = "application/json; charset=utf-8"

        last_error: ScreepsAPIError | None = None
        for attempt in range(self.max_retries + 1):
            request = Request(url, data=body, headers=headers, method=method)
            try:
                with self._open(request, timeout=self.timeout) as response:
                    response_headers = getattr(response, "headers", Message())
                    self._capture_rate_limit(response_headers, method, path)
                    raw = response.read()
                    data = json.loads(raw.decode("utf-8")) if raw else {}
                    if not isinstance(data, dict):
                        raise ScreepsAPIError("Screeps API returned a non-object JSON response")
                    if data.get("ok") not in (None, 1, True) or data.get("error"):
                        raise ScreepsAPIError(
                            f"Screeps API rejected {method} {path}: {data.get('error', 'unknown error')}",
                            status=getattr(response, "status", None),
                        )
                    return data
            except HTTPError as exc:
                self._capture_rate_limit(exc.headers, method, path)
                retry_after = self._retry_after(exc.headers, exc)
                transient = exc.code in TRANSIENT_STATUSES
                last_error = ScreepsAPIError(
                    f"Screeps API {method} {path} failed with HTTP {exc.code}",
                    status=exc.code,
                    transient=transient,
                    retry_after=retry_after,
                )
            except (URLError, TimeoutError, socket.timeout) as exc:
                reason = getattr(exc, "reason", exc)
                last_error = ScreepsAPIError(
                    f"Screeps API {method} {path} transport failure: {type(reason).__name__}",
                    transient=True,
                )
            except json.JSONDecodeError:
                raise ScreepsAPIError(f"Screeps API {method} {path} returned invalid JSON") from None

            # Repeating a write while the endpoint bucket is empty only extends
            # a restart/rate-limit storm. The transport persists the reset
            # deadline and retries the same command ID after that deadline.
            if (
                last_error.status == 429
                and method.upper() == "POST"
                and path == "/api/user/memory-segment"
            ):
                raise last_error
            if not last_error.transient or attempt >= self.max_retries:
                raise last_error
            self._sleep(self._backoff(attempt, last_error.retry_after))

        raise last_error or ScreepsAPIError("Screeps request failed")

    def _capture_rate_limit(
        self,
        headers: Mapping[str, str] | Message | None,
        method: str,
        path: str,
    ) -> None:
        if headers is None:
            return
        rate_limit = RateLimit(
            self._optional_int(headers.get("X-RateLimit-Limit")),
            self._optional_int(headers.get("X-RateLimit-Remaining")),
            self._optional_int(headers.get("X-RateLimit-Reset")),
        )
        if rate_limit == RateLimit(None, None, None):
            return
        self.last_rate_limit = rate_limit
        self._rate_limits[(method.upper(), path)] = rate_limit

    def rate_limit_for(self, method: str, path: str) -> RateLimit:
        return self._rate_limits.get(
            (method.upper(), path), RateLimit(None, None, None)
        )

    @property
    def memory_segment_write_rate_limit(self) -> RateLimit:
        return self.rate_limit_for("POST", "/api/user/memory-segment")

    @staticmethod
    def _optional_int(value: str | None) -> int | None:
        try:
            return int(value) if value is not None else None
        except (TypeError, ValueError):
            return None

    def _retry_after(self, headers: Mapping[str, str] | Message | None, error: HTTPError) -> float | None:
        if headers:
            retry_header = headers.get("Retry-After")
            if retry_header:
                try:
                    return max(0.0, float(retry_header))
                except ValueError:
                    pass
            reset = self._optional_int(headers.get("X-RateLimit-Reset"))
            if reset is not None:
                return max(0.0, reset - self._clock())
        try:
            body = error.read().decode("utf-8", errors="replace")
        except Exception:
            return None
        marker = "retry after "
        lowered = body.lower()
        if marker in lowered:
            suffix = lowered.split(marker, 1)[1].split("ms", 1)[0].strip()
            try:
                return max(0.0, float(suffix) / 1000.0)
            except ValueError:
                return None
        return None

    def _backoff(self, attempt: int, retry_after: float | None) -> float:
        if retry_after is not None:
            return min(self.max_backoff_seconds, retry_after)
        exponential = self.backoff_seconds * (2**attempt)
        jitter = self.backoff_seconds * 0.25 * self._random()
        return min(self.max_backoff_seconds, exponential + jitter)

    def list_branches(self) -> list[dict[str, Any]]:
        data = self._request("GET", "/api/user/branches")
        branches = data.get("list", [])
        if not isinstance(branches, list):
            raise ScreepsAPIError("Screeps branch list has an invalid shape")
        return [item for item in branches if isinstance(item, dict)]

    def active_world_branch(self) -> str | None:
        for branch in self.list_branches():
            if branch.get("activeWorld") is True:
                return str(branch.get("branch"))
        return None

    def get_code(self, branch: str) -> dict[str, str]:
        data = self._request("GET", "/api/user/code", query={"branch": branch})
        modules = data.get("modules")
        if not isinstance(modules, dict):
            raise ScreepsAPIError(f"Screeps branch {branch!r} returned no module map")
        return {str(name): str(source) for name, source in modules.items()}

    def upload_code(self, branch: str, modules: Mapping[str, str]) -> None:
        branch_names = {str(item.get("branch")) for item in self.list_branches()}
        if branch in branch_names:
            self._request(
                "POST",
                "/api/user/code",
                payload={"branch": branch, "modules": dict(modules), "_hash": int(time.time() * 1000)},
            )
            return
        self._request(
            "POST",
            "/api/user/clone-branch",
            payload={"branch": "", "newName": branch, "defaultModules": dict(modules)},
        )

    def activate_branch(self, branch: str) -> None:
        self._request(
            "POST",
            "/api/user/set-active-branch",
            payload={"branch": branch, "activeName": "activeWorld"},
        )

    def read_segment(self, segment: int, *, shard: str | None = None) -> str | None:
        self._validate_segment(segment)
        data = self._request(
            "GET",
            "/api/user/memory-segment",
            query={"segment": segment, "shard": shard or self.shard},
        )
        value = data.get("data")
        if value is None:
            return None
        if not isinstance(value, str):
            raise ScreepsAPIError(f"Memory Segment {segment} returned a non-string value")
        return value

    def write_segment(self, segment: int, data: str, *, shard: str | None = None) -> None:
        self._validate_segment(segment)
        if not isinstance(data, str):
            raise TypeError("segment data must be a string")
        if len(data.encode("utf-8")) > 100 * 1024:
            raise ValueError("segment data exceeds the Screeps 100 KB limit")
        self._request(
            "POST",
            "/api/user/memory-segment",
            payload={"segment": segment, "data": data, "shard": shard or self.shard},
        )

    def world_status(self) -> str:
        data = self._request("GET", "/api/user/world-status")
        return str(data.get("status", "unknown"))

    @staticmethod
    def _validate_segment(segment: int) -> None:
        if not isinstance(segment, int) or isinstance(segment, bool) or not 0 <= segment <= 99:
            raise ValueError("segment must be an integer from 0 through 99")
