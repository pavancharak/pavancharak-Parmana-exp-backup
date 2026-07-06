"""
Parmana Policy API.

Validate Runtime policies.
"""

from __future__ import annotations

from typing import Any, cast

from parmana.config.transport import Transport


class PolicyApi:
    """
    Policy API.

    Responsibilities
    ----------------
    - Confirm a policy (name + version) is loadable by the Runtime

    This API does NOT:
    - validate an arbitrary policy document's contents. POST
      /policies/validate (packages/api/src/routes/policies.ts) only
      checks that `policyRepository.load(policyId, policyVersion)`
      succeeds -- it does not accept or check a policy document body.
    - execute Business Transactions
    - verify trust records
    - replay executions
    - generate receipts
    """

    def __init__(
        self,
        transport: Transport,
    ) -> None:
        self._transport = transport

    def validate(
        self,
        policy_id: str,
        policy_version: str,
    ) -> dict[str, Any]:
        """
        Confirm that a policy (name + version) is loadable.

        Parameters
        ----------
        policy_id:
            Policy identifier (`policyId`).

        policy_version:
            Policy version (`policyVersion`).

        Returns
        -------
        `{"valid": bool, "errors": list[str]}`.
        """

        return cast(
            "dict[str, Any]",
            self._transport.send(
                method="POST",
                path="/policies/validate",
                body={
                    "policyId": policy_id,
                    "policyVersion": policy_version,
                },
            ),
        )
