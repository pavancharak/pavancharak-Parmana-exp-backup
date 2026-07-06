from __future__ import annotations

from parmana.api.policy_api import PolicyApi


class FakeTransport:
    def __init__(self):
        self.called = False
        self.method = None
        self.path = None
        self.body = None
        self.response_model = None

    def send(
        self,
        *,
        method,
        path,
        body=None,
        response_model=None,
    ):
        self.called = True
        self.method = method
        self.path = path
        self.body = body
        self.response_model = response_model

        return {"valid": True, "errors": []}


def test_validate_sends_policy_id_and_version():
    """
    Regression test: a previous SDK version took `validate(policy: dict)`
    as if the endpoint checked an arbitrary policy document. The real
    route (packages/api/src/routes/policies.ts) only reads policyId and
    policyVersion from the body.
    """

    transport = FakeTransport()

    api = PolicyApi(transport)

    result = api.validate("vendor-payment", "1.0.0")

    assert transport.called
    assert transport.method == "POST"
    assert transport.path == "/policies/validate"
    assert transport.body == {
        "policyId": "vendor-payment",
        "policyVersion": "1.0.0",
    }

    assert result == {"valid": True, "errors": []}
