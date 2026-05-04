import time
import unittest
from unittest import mock

from app import nnai_service


class FakeResponse:
    def __init__(self, status_code=200, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text

    def json(self):
        return self._payload


class FakeSession:
    def __init__(self, response):
        self.response = response
        self.headers = {}
        self.calls = []

    def get(self, url, params=None, timeout=None):
        self.calls.append({"url": url, "params": params, "timeout": timeout})
        return self.response


class FakeNNAIClient:
    def __init__(self, payload):
        self.payload = payload
        self.calls = []

    def get_code_payload(self, email):
        self.calls.append(email)
        return self.payload


class NNAIServiceTests(unittest.TestCase):
    def tearDown(self):
        nnai_service._sessions.clear()

    def test_create_temp_email_returns_nnai_address_and_credential(self):
        with (
            mock.patch.object(nnai_service, "_generate_local_part", return_value="xxvv"),
            mock.patch.object(nnai_service, "get_configured_domains", return_value=["nnai.website"]),
        ):
            email, session_id, credential = nnai_service.create_temp_email()

        self.assertEqual(email, "xxvv@nnai.website")
        self.assertEqual(credential, "xxvv@nnai.website")
        self.assertIn(session_id, nnai_service._sessions)

    def test_create_temp_email_accepts_selected_domain(self):
        with mock.patch.object(nnai_service, "_generate_local_part", return_value="xxvv"):
            email, session_id, credential = nnai_service.create_temp_email(domain="mail.example.com")

        self.assertEqual(email, "xxvv@mail.example.com")
        self.assertEqual(credential, "xxvv@mail.example.com")
        self.assertIn(session_id, nnai_service._sessions)

    def test_generate_local_part_includes_month_day_prefix(self):
        fake_datetime = mock.Mock()
        fake_datetime.now.return_value.strftime.return_value = "0504"
        with (
            mock.patch.object(nnai_service, "datetime", fake_datetime),
            mock.patch.object(nnai_service.random, "choices", return_value=list("abc123")),
        ):
            local_part = nnai_service._generate_local_part(length=6)

        self.assertEqual(local_part, "0504abc123")

    def test_normalize_domain_list_deduplicates_and_strips_at_prefix(self):
        self.assertEqual(
            nnai_service.normalize_domain_list(["@NNAI.website", "nnai.website", "mail.example.com"]),
            ["nnai.website", "mail.example.com"],
        )

    def test_client_fetches_code_with_email_and_json_format(self):
        fake_session = FakeSession(
            FakeResponse(payload={"email": "xxvv@nnai.website", "code": "026303"})
        )
        client = nnai_service.NNAIClient(session=fake_session)

        payload = client.get_code_payload("xxvv@nnai.website")

        self.assertEqual(payload["code"], "026303")
        self.assertEqual(fake_session.calls[0]["url"], nnai_service.API_CODE_URL)
        self.assertEqual(
            fake_session.calls[0]["params"],
            {"email": "xxvv@nnai.website", "format": "json"},
        )

    def test_wait_for_verification_email_returns_payload_code(self):
        client = FakeNNAIClient(
            {
                "email": "xxvv@nnai.website",
                "code": "026303",
                "received_at": int(time.time() * 1000),
            }
        )
        session_id = nnai_service._create_session("xxvv@nnai.website", client=client)

        code = nnai_service.wait_for_verification_email(session_id, timeout=1)

        self.assertEqual(code, "026303")
        self.assertEqual(client.calls, ["xxvv@nnai.website"])

    def test_list_verification_codes_extracts_code_from_subject_fallback(self):
        client = FakeNNAIClient(
            {
                "email": "xxvv@nnai.website",
                "subject": "Your ChatGPT code is 654321",
                "received_at": int(time.time() * 1000),
            }
        )
        session_id = nnai_service._create_session("xxvv@nnai.website", client=client)

        self.assertEqual(nnai_service.list_verification_codes(session_id), ["654321"])

    def test_login_existing_email_requires_valid_email(self):
        with self.assertRaisesRegex(RuntimeError, "格式无效"):
            nnai_service.login_existing_email("not-an-email", "")

        session_id = nnai_service.login_existing_email("xxvv@nnai.website", "")
        self.assertIn(session_id, nnai_service._sessions)


if __name__ == "__main__":
    unittest.main()
