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
from requests.exceptions import ReadTimeout

from parmana.errors import (
    AuthenticationError,
    AuthorizationError,
    ConflictError,
    ExecutionRejectedError,
    NetworkError,
    NotFoundError,
    ServerError,
    TimeoutError as ParmanaTimeoutError,
    ValidationError,
)
from parmana.transport.http_transport import HttpTransport

ENDPOINT = "http://localhost:3000"


def _transport(api_key: str | None = None) -> HttpTransport:
    return HttpTransport(endpoint=ENDPOINT, api_key=api_key)


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
def test_403_raises_authorization_error():
    """
    Real, live-verified response shape (packages/api/src/routes/execute.ts,
    isPrincipalAllowed): a 403 is the caller asserting an
    authority.principalId it isn't permitted to assert -- not a policy
    rejection. No `code` field.
    """
    responses.add(
        responses.POST,
        f"{ENDPOINT}/execute",
        json={"error": "Caller is not permitted to assert this authority.principalId."},
        status=403,
    )

    with pytest.raises(AuthorizationError) as excinfo:
        _transport().send(method="POST", path="/execute", body={})

    assert excinfo.value.status_code == 403


@responses.activate
def test_403_policy_denied_raises_execution_rejected_error():
    """
    Real, live-verified response shape: Policy evaluation returning
    REJECTED now carries its own dedicated HTTP 403, code POLICY_DENIED,
    message starting "Execution rejected:" -- replacing the old,
    ambiguous 500 + code RUNTIME_ERROR shape this mapping used to
    special-case via a message-prefix sniff (see build_http_error's own
    docstring, and typescript/src/transport/mapHttpErrorResponse.ts's
    identical, identically-ordered check). Confirmed live against a real
    risk-rejected vendor-payment transaction.
    """
    responses.add(
        responses.POST,
        f"{ENDPOINT}/execute",
        json={
            "error": (
                "Execution rejected: Vendor payment rejected because the "
                "assessed payment risk exceeds the maximum permitted threshold."
            ),
            "code": "POLICY_DENIED",
        },
        status=403,
    )

    with pytest.raises(ExecutionRejectedError) as excinfo:
        _transport().send(method="POST", path="/execute", body={})

    assert excinfo.value.status_code == 403
    assert "Vendor payment rejected" in str(excinfo.value)


@responses.activate
def test_403_without_code_stays_authorization_error():
    """
    Defensive: the *other* 403 this API returns -- a caller asserting an
    authority.principalId it isn't permitted to assert
    (packages/api/src/routes/execute.ts, isPrincipalAllowed) -- carries
    no `code` field at all and must still map to the generic
    AuthorizationError, not be swept up by the POLICY_DENIED check.
    """
    responses.add(
        responses.POST,
        f"{ENDPOINT}/execute",
        json={"error": "Caller is not permitted to assert this authority.principalId."},
        status=403,
    )

    with pytest.raises(AuthorizationError) as excinfo:
        _transport().send(method="POST", path="/execute", body={})

    assert not isinstance(excinfo.value, ExecutionRejectedError)


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
def test_non_throwing_statuses_returns_payload_instead_of_raising():
    """
    POST /policies/validate's own shape: a status listed in
    non_throwing_statuses must come back as an ordinary payload, not
    raise, even though it's a non-2xx status.
    """
    responses.add(
        responses.POST,
        f"{ENDPOINT}/policies/validate",
        json={
            "valid": False,
            "errors": ["Policy 'does-not-exist' version '9.9.9' was not found."],
        },
        status=404,
    )

    payload = _transport().send(
        method="POST",
        path="/policies/validate",
        body={},
        non_throwing_statuses=frozenset({400, 404}),
    )

    assert payload == {
        "valid": False,
        "errors": ["Policy 'does-not-exist' version '9.9.9' was not found."],
    }


@responses.activate
def test_non_throwing_statuses_does_not_suppress_an_unlisted_status():
    """
    401 on POST /policies/validate is not in non_throwing_statuses (it's
    generated by caller-auth middleware before the route's own handler
    runs, using the shared envelope) -- it must still raise.
    """
    responses.add(
        responses.POST,
        f"{ENDPOINT}/policies/validate",
        json={"error": "authentication required"},
        status=401,
    )

    with pytest.raises(AuthenticationError):
        _transport().send(
            method="POST",
            path="/policies/validate",
            body={},
            non_throwing_statuses=frozenset({400, 404}),
        )


@responses.activate
def test_api_key_attaches_authorization_header():
    responses.add(
        responses.GET,
        f"{ENDPOINT}/version",
        json={"name": "Parmana", "version": "0.4.0", "api": "v1"},
        status=200,
    )

    _transport(api_key="my-secret-api-key").send(method="GET", path="/version")

    sent_request = responses.calls[0].request
    assert sent_request.headers["Authorization"] == "Bearer my-secret-api-key"


@responses.activate
def test_no_api_key_omits_authorization_header():
    responses.add(
        responses.GET,
        f"{ENDPOINT}/health",
        json={"status": "UP"},
        status=200,
    )

    _transport().send(method="GET", path="/health")

    sent_request = responses.calls[0].request
    assert "Authorization" not in sent_request.headers


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
def test_read_timeout_raises_timeout_error_not_generic_network_error():
    """
    A request timeout is a distinguishable failure mode (the Runtime may
    still be processing) from a connection failure (nothing is
    listening) -- mirrors typescript/src/transport/HttpTransport.ts,
    which raises TimeoutError, not NetworkError, on an aborted request.
    """
    responses.add(
        responses.GET,
        f"{ENDPOINT}/health",
        body=ReadTimeout("Read timed out."),
    )

    with pytest.raises(ParmanaTimeoutError) as excinfo:
        _transport().send(method="GET", path="/health")

    # TimeoutError subclasses NetworkError, so pre-existing
    # `except NetworkError` call sites keep catching timeouts too.
    assert isinstance(excinfo.value, NetworkError)


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
