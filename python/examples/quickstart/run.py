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
    Authorization,
    BusinessTransaction,
    BusinessTransactionMetadata,
    Intent,
    ParmanaClient,
    PolicyReference,
)


def main() -> None:
    client = ParmanaClient(endpoint="http://localhost:3000")

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
            authority_type="SERVICE",
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
            action="payments:execute",
            target="vendor://payments",
            parameters={
                "amount": 1000,
                "currency": "USD",
            },
            created_at=now,
        ),
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
        },
        status="RECEIVED",
        created_at=now,
    )

    trust_record = client.execution.execute(transaction)

    print(f"\nBusiness Transaction ID: {transaction_id}")
    print(f"Trust Record ID:         {trust_record.trust_record_id}")
    print(f"Trust Record Hash:       {trust_record.trust_record_hash}")
    print(f"Signature Algorithm:     {trust_record.signature.algorithm}")

    print("\nFull Execution Trust Record:")
    print(json.dumps(asdict(trust_record), indent=2, default=str))


if __name__ == "__main__":
    main()
