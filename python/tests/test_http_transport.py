"""
Tests for the real HttpTransport request/response/error path.

Unlike test_execution_api.py / test_verification_api.py / etc. (which use
a FakeTransport and never touch HttpTransport at all), these tests mock
the actual HTTP layer with `responses` so the status-code -> exception
mapping and success-path decoding are proven end to end.
"""

from __future__ import annotations

import logging

import pytest
import responses
from requests.exceptions import ConnectionError as RequestsConnectionError

from parmana.errors import (
    AuthenticationError,
    ConflictError,
    ExecutionRejectedError,
    NetworkError,
    NotFoundError,
    ServerError,
    ValidationError,
)
from parmana.transport.http_transport import HttpTransport

ENDPOINT = "http://localhost:3000"


def _transport() -> HttpTransport:
    return HttpTransport(endpoint=ENDPOINT)


@responses.activate
def test_send_returns_decoded_success_payload():
    responses.add(
        responses.GET,
        f"{ENDPOINT}/health",
        json={"status": "UP"},
        status=200,
    )

    payload = _transport().send(method="GET", path="/health")

    assert payload == {"status": "UP"}


@responses.activate
def test_send_returns_none_for_empty_body():
    responses.add(
        responses.GET,
        f"{ENDPOINT}/health",
        body="",
        status=204,
    )

    payload = _transport().send(method="GET", path="/health")

    assert payload is None


@responses.activate
def test_400_raises_validation_error():
    responses.add(
        responses.POST,
        f"{ENDPOINT}/verify",
        json={"error": "businessTransactionId must be a valid UUID."},
        status=400,
    )

    with pytest.raises(ValidationError) as excinfo:
        _transport().send(method="POST", path="/verify", body={})

    assert excinfo.value.status_code == 400
    assert "businessTransactionId" in str(excinfo.value)


@responses.activate
def test_401_raises_authentication_error():
    responses.add(
        responses.GET,
        f"{ENDPOINT}/trust-records/tx-001",
        json={"error": "Unauthorized."},
        status=401,
    )

    with pytest.raises(AuthenticationError) as excinfo:
        _transport().send(method="GET", path="/trust-records/tx-001")

    assert excinfo.value.status_code == 401


@responses.activate
def test_403_raises_execution_rejected_error():
    responses.add(
        responses.POST,
        f"{ENDPOINT}/execute",
        json={"error": "Decision rejected by policy."},
        status=403,
    )

    with pytest.raises(ExecutionRejectedError) as excinfo:
        _transport().send(method="POST", path="/execute", body={})

    assert excinfo.value.status_code == 403


@responses.activate
def test_404_raises_not_found_error():
    responses.add(
        responses.GET,
        f"{ENDPOINT}/trust-records/missing",
        json={"error": "Execution Trust Record not found."},
        status=404,
    )

    with pytest.raises(NotFoundError) as excinfo:
        _transport().send(method="GET", path="/trust-records/missing")

    assert excinfo.value.status_code == 404


@responses.activate
def test_409_raises_conflict_error():
    responses.add(
        responses.POST,
        f"{ENDPOINT}/transactions",
        json={"error": "Duplicate Business Transaction."},
        status=409,
    )

    with pytest.raises(ConflictError) as excinfo:
        _transport().send(method="POST", path="/transactions", body={})

    assert excinfo.value.status_code == 409


@responses.activate
def test_500_raises_server_error():
    responses.add(
        responses.GET,
        f"{ENDPOINT}/health",
        json={"error": "Internal Server Error"},
        status=500,
    )

    with pytest.raises(ServerError) as excinfo:
        _transport().send(method="GET", path="/health")

    assert excinfo.value.status_code == 500


@responses.activate
def test_connection_failure_raises_network_error():
    responses.add(
        responses.GET,
        f"{ENDPOINT}/health",
        body=RequestsConnectionError("connection refused"),
    )

    with pytest.raises(NetworkError):
        _transport().send(method="GET", path="/health")


@responses.activate
def test_debug_logs_via_logger_not_print(capsys):
    """
    Regression test: a previous SDK version used print() for debug
    output. Debug mode must go through the "parmana" logger instead, so
    application code can control/capture it via standard logging config.
    """

    responses.add(
        responses.GET,
        f"{ENDPOINT}/health",
        json={"status": "UP"},
        status=200,
    )

    logger = logging.getLogger("parmana")
    original_level = logger.level
    original_handlers = list(logger.handlers)

    try:
        HttpTransport(endpoint=ENDPOINT, debug=True).send(
            method="GET",
            path="/health",
        )

        captured = capsys.readouterr()

        assert captured.out == ""
    finally:
        logger.level = original_level
        logger.handlers = original_handlers
