import responses

from parmana import ConflictError, ExecutionTrustRecord, ParmanaClient, ParmanaHttpError


def test_client_creation():
    client = ParmanaClient(
        endpoint="http://localhost:3000",
    )

    assert client.endpoint == "http://localhost:3000"


def test_client_creation_without_api_key_does_not_set_authorization():
    client = ParmanaClient(endpoint="http://localhost:3000")

    assert "Authorization" not in client._transport._session.headers


@responses.activate
def test_client_api_key_flows_through_to_every_request():
    """
    ParmanaClient(api_key=...) -> HttpTransport -> a real Authorization
    header on the wire, end to end through the public constructor, not
    just at the HttpTransport unit level.
    """
    responses.add(
        responses.GET,
        "http://localhost:3000/health",
        json={"status": "UP"},
        status=200,
    )

    client = ParmanaClient(
        endpoint="http://localhost:3000",
        api_key="my-secret-api-key",
    )

    client.execution.health()

    sent_request = responses.calls[0].request
    assert sent_request.headers["Authorization"] == "Bearer my-secret-api-key"


def test_models_and_errors_are_importable_from_top_level_package():
    """
    Regression test: errors were only importable via
    `parmana.errors.*`, not from the top-level `parmana` package, unlike
    models. `from parmana import ConflictError` previously raised
    ImportError.
    """

    assert issubclass(ConflictError, ParmanaHttpError)
    assert ExecutionTrustRecord is not None
