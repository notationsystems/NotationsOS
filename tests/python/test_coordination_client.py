import importlib.util
import io
import json
import pathlib
import unittest
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlparse

CLIENT_PATH = pathlib.Path(__file__).resolve().parents[2] / "clients" / "python" / "payload_coordination.py"
SPEC = importlib.util.spec_from_file_location("payload_coordination", CLIENT_PATH)
CLIENT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CLIENT)
CoordinationClient = CLIENT.CoordinationClient
CoordinationClientError = CLIENT.CoordinationClientError


class Response(io.BytesIO):
    def __init__(self, body=b'{"fixture_only":true,"messages":[]}', status=200):
        super().__init__(body)
        self.status = status


class CoordinationClientTests(unittest.TestCase):
    def test_retry_preserves_serialized_command_and_request_id(self):
        message = {"requestId": "python-retry-1", "body": "original", "context": {"releaseId": "release-1"}}
        calls, waits = [], []

        def opener(request, timeout):
            calls.append((request, timeout))
            if len(calls) == 1:
                message["body"] = "changed by caller"
                message["context"]["releaseId"] = "changed"
                raise URLError("disconnected")
            return Response()

        result = CoordinationClient(opener=opener, sleep=waits.append).post(message)
        self.assertTrue(result["fixture_only"])
        self.assertEqual(calls[0][0].data, calls[1][0].data)
        self.assertEqual(json.loads(calls[0][0].data), {"operation": "post", "message": {"requestId": "python-retry-1", "body": "original", "context": {"releaseId": "release-1"}}})
        self.assertEqual(waits, [0.1])
        self.assertEqual([timeout for _, timeout in calls], [10, 10])

    def test_transient_http_statuses_retry(self):
        for status in (408, 429, 502, 503, 504):
            with self.subTest(status=status):
                calls = []

                def opener(request, timeout):
                    calls.append(request)
                    if len(calls) == 1:
                        raise HTTPError(request.full_url, status, "retry", {}, io.BytesIO(b'{"error":"BUSY","detail":"Try again"}'))
                    return Response()

                self.assertTrue(CoordinationClient(opener=opener, sleep=lambda _: None).snapshot()["fixture_only"])
                self.assertEqual(len(calls), 2)

    def test_semantic_errors_do_not_retry_and_expose_details(self):
        for status in (400, 403, 404, 409, 500):
            with self.subTest(status=status):
                calls = []

                def opener(request, timeout):
                    calls.append(request)
                    raise HTTPError(request.full_url, status, "conflict", {}, io.BytesIO(b'{"error":"IDEMPOTENCY_CONFLICT","detail":"Request id already used."}'))

                with self.assertRaises(CoordinationClientError) as caught:
                    CoordinationClient(opener=opener).snapshot()
                self.assertEqual((caught.exception.status, caught.exception.code, caught.exception.detail), (status, "IDEMPOTENCY_CONFLICT", "Request id already used."))
                self.assertEqual(len(calls), 1)

    def test_transient_http_failure_retries_even_with_non_json_body(self):
        calls = []

        def opener(request, timeout):
            calls.append(request)
            return Response(b"<html>Unavailable</html>", 503) if len(calls) == 1 else Response()

        CoordinationClient(opener=opener, sleep=lambda _: None).snapshot()
        self.assertEqual(len(calls), 2)

    def test_api_code_cannot_turn_conflict_into_transport_retry(self):
        calls = []

        def opener(request, timeout):
            calls.append(request)
            return Response(b'{"error":"NETWORK_ERROR"}', 409)

        with self.assertRaises(CoordinationClientError):
            CoordinationClient(opener=opener).snapshot()
        self.assertEqual(len(calls), 1)

    def test_retry_limit_backoff_and_timeout(self):
        calls, waits = [], []

        def opener(request, timeout):
            calls.append(timeout)
            raise TimeoutError("timed out")

        with self.assertRaises(CoordinationClientError) as caught:
            CoordinationClient(opener=opener, timeout=0.5, sleep=waits.append).snapshot()
        self.assertEqual(caught.exception.code, "TIMEOUT")
        self.assertEqual(calls, [0.5, 0.5, 0.5])
        self.assertEqual(waits, [0.1, 0.2])

    def test_malformed_and_nonobject_json_are_rejected(self):
        for body in (b"invalid", b"[]", b"null", b'"string"', b"1", b'{"value":NaN}'):
            with self.subTest(body=body):
                calls = []

                def opener(request, timeout):
                    calls.append(request)
                    return Response(body)

                with self.assertRaises(CoordinationClientError) as caught:
                    CoordinationClient(opener=opener).snapshot()
                self.assertEqual(caught.exception.code, "INVALID_RESPONSE")
                self.assertEqual(len(calls), 1)

    def test_inbox_encodes_query_values(self):
        calls = []

        def opener(request, timeout):
            calls.append(request)
            return Response()

        client = CoordinationClient(opener=opener)
        client.inbox("agent:one/part?x&after=999", after_sequence=7, limit=12, include_acknowledged=True, include_broadcasts=True, kind="REQUEST")
        parsed = urlparse(calls[0].full_url)
        self.assertEqual(parsed.path, "/api/coordination/inbox")
        self.assertEqual(parse_qs(parsed.query), {"participant": ["agent:one/part?x&after=999"], "after": ["7"], "limit": ["12"], "acknowledged": ["true"], "broadcasts": ["true"], "kind": ["REQUEST"]})
        client.inbox("worker")
        self.assertEqual(parse_qs(urlparse(calls[1].full_url).query), {"participant": ["worker"], "after": ["0"], "limit": ["50"], "acknowledged": ["false"], "broadcasts": ["false"]})

    def test_command_envelopes(self):
        calls = []

        def opener(request, timeout):
            calls.append(request)
            return Response()

        client = CoordinationClient(opener=opener)
        participant = {"id": "worker", "scope": "local"}
        client.register(participant)
        client.acknowledge("MSG-00001", "worker")
        self.assertEqual([json.loads(request.data) for request in calls], [
            {"operation": "register", "participant": participant},
            {"operation": "acknowledge", "messageId": "MSG-00001", "participantId": "worker"},
        ])

    def test_post_requires_request_id(self):
        for message in ({}, {"requestId": ""}, {"requestId": " "}, {"requestId": 23}, None):
            with self.subTest(message=message), self.assertRaises(CoordinationClientError):
                CoordinationClient().post(message)

    def test_invalid_client_configuration(self):
        for attempts in (0, -1, 1.5, 11, True, float("inf")):
            with self.subTest(attempts=attempts), self.assertRaises(ValueError):
                CoordinationClient(attempts=attempts)
        for timeout in (0, -1, True, float("inf"), float("nan"), "10"):
            with self.subTest(timeout=timeout), self.assertRaises(ValueError):
                CoordinationClient(timeout=timeout)


if __name__ == "__main__":
    unittest.main()
