from parmana import ConflictError, ExecutionTrustRecord, ParmanaClient, ParmanaHttpError


def test_client_creation():
    client = ParmanaClient(
        endpoint="http://localhost:3000",
    )

    assert client.endpoint == "http://localhost:3000"


def test_models_and_errors_are_importable_from_top_level_package():
    """
    Regression test: errors were only importable via
    `parmana.errors.*`, not from the top-level `parmana` package, unlike
    models. `from parmana import ConflictError` previously raised
    ImportError.
    """

    assert issubclass(ConflictError, ParmanaHttpError)
    assert ExecutionTrustRecord is not None
