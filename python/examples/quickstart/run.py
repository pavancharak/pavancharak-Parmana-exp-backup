"""
Quickstart.

Construct a ParmanaClient, submit a Business Transaction, and receive
the resulting Execution Trust Record.

See README.md in this directory for prerequisites and expected output.
"""

from __future__ import annotations

import json
from dataclasses import asdict
from datetime import UTC, datetime
from uuid import uuid4

from parmana import (
    Authority,
    AuthorityType,
    Authorization,
    BusinessTransaction,
    BusinessTransactionMetadata,
    BusinessTransactionStatus,
    ExecutionTrustRecord,
    Intent,
    ParmanaClient,
    PolicyReference,
)


def run_quickstart(endpoint: str = "http://localhost:3000") -> ExecutionTrustRecord:
    """
    Constructs a ParmanaClient, submits a Business Transaction, and
    returns the resulting Execution Trust Record. Exported (rather than
    only run as a top-level script) so
    tests/test_quickstart_example.py can prove this exact example
    actually works against a real running server, not just that it
    compiles.
    """

    client = ParmanaClient(endpoint=endpoint)

    print(f"Connected to {client.endpoint} (SDK v{client.version})")

    transaction_id = str(uuid4())
    now = datetime.now(UTC)

    transaction = BusinessTransaction(
        business_transaction_id=transaction_id,
        metadata=BusinessTransactionMetadata(
            business_transaction_id=transaction_id,
            correlation_id="quickstart",
            tenant_id=None,
            source_system="python-sdk-quickstart",
            submitted_by="sdk-demo",
            submitted_at=now,
        ),
        authority=Authority(
            authority_id="authority-001",
            authority_type=AuthorityType.SERVICE,
            principal_id="python-sdk",
            display_name="Python SDK Quickstart",
            issued_at=now,
        ),
        authorization=Authorization(
            authorization_id="authorization-001",
            authority_id="authority-001",
            purpose="Quickstart demo",
            issued_at=now,
        ),
        intent=Intent(
            intent_id="intent-001",
            authorization_id="authorization-001",
            # test:fixture-execute, not payments:execute: payments:execute
            # (vendor-payment) was removed from the repository entirely, not
            # renamed (docs/VERIFICATION-GAPS.md G-27). test:fixture-execute
            # is a generic, test-only connector (NODE_ENV=test only,
            # createTestFixtureConnector.ts) that plays the same
            # zero-external-dependency role vendor-payment used to for this
            # example.
            action="test:fixture-execute",
            target="vendor://payments",
            parameters={
                "amount": 1000,
                "currency": "USD",
            },
            created_at=now,
        ),
        # Still governed by the vendor-payment/2.0.0 policy, kept unchanged
        # as generic example content -- policy content and capability
        # identity are independent concepts in this architecture.
        policy=PolicyReference(
            name="vendor-payment",
            version="2.0.0",
            schema_version="1.0.0",
        ),
        signals={
            "vendorVerified": True,
            "invoiceVerified": True,
            "paymentApproved": True,
            "sufficientFunds": True,
            "paymentAmount": 1000,
            "riskScore": 5,
            # vendor-payment@2.0.0 declares boundSignals: { "vendorId": "target" } —
            # SignalIntentBinder rejects this transaction unless this signal exactly
            # equals intent.target, checked before policy evaluation ever runs (see
            # docs/VERIFICATION-GAPS.md G-24). Omitting it is the exact bug this
            # example itself used to have.
            "vendorId": "vendor://payments",
        },
        status=BusinessTransactionStatus.RECEIVED,
        created_at=now,
    )

    trust_record = client.execution.execute(transaction)

    print(f"\nBusiness Transaction ID: {transaction_id}")
    print(f"Trust Record ID:         {trust_record.trust_record_id}")
    print(f"Trust Record Hash:       {trust_record.trust_record_hash}")
    print(f"Signature Algorithm:     {trust_record.signature.algorithm}")

    print("\nFull Execution Trust Record:")
    print(json.dumps(asdict(trust_record), indent=2, default=str))

    return trust_record


def main() -> None:
    run_quickstart()


if __name__ == "__main__":
    main()
