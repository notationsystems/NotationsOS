"""Standard-library client for the local Payload OS coordination sandbox.

Participant IDs name simulated authors; they are not authentication credentials.
All retries reuse the exact encoded command and the caller-supplied requestId.
"""

import json
import math
import socket
import time
from http.client import IncompleteRead
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin, urlparse
from urllib.request import Request, urlopen


class CoordinationClientError(Exception):
    def __init__(self, status, code, detail):
        super().__init__(detail)
        self.status = status
        self.code = code
        self.detail = detail


class CoordinationClient:
    RETRYABLE_STATUS = frozenset((408, 429, 502, 503, 504))

    def __init__(self, base_url="http://127.0.0.1:3000", *, timeout=10,
                 attempts=3, opener=None, sleep=time.sleep):
        parsed = urlparse(base_url)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise ValueError("base_url must be an absolute HTTP or HTTPS URL.")
        if isinstance(attempts, bool) or not isinstance(attempts, int) or not 1 <= attempts <= 10:
            raise ValueError("attempts must be an integer between 1 and 10.")
        if isinstance(timeout, bool) or not isinstance(timeout, (int, float)) or not math.isfinite(timeout) or timeout <= 0:
            raise ValueError("timeout must be a positive, finite number of seconds.")
        self.base_url = base_url
        self.timeout = timeout
        self.attempts = attempts
        self.opener = urlopen if opener is None else getattr(opener, "open", opener)
        self.sleep = sleep
        if not callable(self.opener) or not callable(sleep):
            raise TypeError("opener and sleep must be callable.")

    def snapshot(self):
        return self._request("/api/coordination")

    def register(self, participant):
        return self._request("/api/coordination", {"operation": "register", "participant": participant})

    def post(self, message):
        if not isinstance(message, dict) or not isinstance(message.get("requestId"), str) or not message["requestId"].strip():
            raise CoordinationClientError(0, "INVALID_REQUEST_ID", "post requires a caller-supplied, nonempty requestId.")
        return self._request("/api/coordination", {"operation": "post", "message": message})

    def acknowledge(self, message_id, participant_id):
        return self._request("/api/coordination", {
            "operation": "acknowledge", "messageId": message_id, "participantId": participant_id,
        })

    def inbox(self, participant_id, *, after_sequence=0, limit=50,
              include_acknowledged=False, include_broadcasts=False, kind=None):
        query = {
            "participant": participant_id, "after": after_sequence, "limit": limit,
            "acknowledged": str(include_acknowledged).lower(),
            "broadcasts": str(include_broadcasts).lower(),
        }
        if kind is not None:
            query["kind"] = kind
        return self._request("/api/coordination/inbox?" + urlencode(query))

    def _request(self, path, command=None):
        # Encode once so a caller mutation cannot alter a retry's payload.
        body = None if command is None else json.dumps(command, allow_nan=False, separators=(",", ":")).encode("utf-8")
        url = urljoin(self.base_url, path)
        for attempt in range(self.attempts):
            try:
                return self._send(url, body)
            except CoordinationClientError as error:
                retryable = (error.status == 0 and error.code in ("NETWORK_ERROR", "TIMEOUT")) or (
                    error.status in self.RETRYABLE_STATUS
                )
                if not retryable or attempt + 1 == self.attempts:
                    raise
                self.sleep(min(0.1 * (2 ** attempt), 1.0))

    def _send(self, url, body):
        headers = {"Accept": "application/json"}
        if body is not None:
            headers["Content-Type"] = "application/json"
        request = Request(url, data=body, headers=headers, method="GET" if body is None else "POST")
        try:
            try:
                response = self.opener(request, timeout=self.timeout)
            except HTTPError as error:
                response = error
            try:
                status = response.status
                raw = response.read()
            finally:
                response.close()
        except (TimeoutError, socket.timeout) as error:
            raise CoordinationClientError(0, "TIMEOUT", str(error)) from error
        except (URLError, OSError, IncompleteRead) as error:
            code = "TIMEOUT" if isinstance(getattr(error, "reason", None), (TimeoutError, socket.timeout)) else "NETWORK_ERROR"
            raise CoordinationClientError(0, code, str(error)) from error
        def reject_constant(value):
            raise ValueError(f"Invalid JSON number: {value}")

        try:
            value = json.loads(raw, parse_constant=reject_constant)
        except (ValueError, UnicodeError) as error:
            raise CoordinationClientError(status, "INVALID_RESPONSE", "The coordination API returned malformed JSON.") from error
        if not isinstance(value, dict):
            raise CoordinationClientError(status, "INVALID_RESPONSE", "The coordination API must return a JSON object.")
        if not 200 <= status < 300:
            raise CoordinationClientError(status,
                value["error"] if isinstance(value.get("error"), str) else f"HTTP_{status}",
                value["detail"] if isinstance(value.get("detail"), str) else f"Coordination request failed with HTTP {status}.")
        return value
