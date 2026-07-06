"""
Example 09

Multi-Agent Business Transaction.
"""

from __future__ import annotations

import json
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path
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
    client = ParmanaClient(
        endpoint="http://localhost:3000",
    )

    transaction_id = str(uuid4())
    now = datetime.now(UTC)

    transaction = BusinessTransaction(
        business_transaction_id=transaction_id,
        metadata=BusinessTransactionMetadata(
            business_transaction_id=transaction_id,
            correlation_id="multi-agent-demo",
            tenant_id=None,
            source_system="python-sdk-example",
            submitted_by="multi-agent-runtime",
            submitted_at=now,
        ),
        authority=Authority(
            authority_id="authority-001",
            authority_type="SERVICE",
            principal_id="multi-agent-runtime",
            display_name="Multi-Agent Runtime",
            issued_at=now,
        ),
        authorization=Authorization(
            authorization_id="authorization-001",
            authority_id="authority-001",
            purpose="Execute multi-agent workflow",
            issued_at=now,
        ),
        intent=Intent(
            intent_id="intent-001",
            authorization_id="authorization-001",
            action="VendorPayment",
            target="vendor/V-100",
            parameters={
                "amount": 1000,
                "currency": "USD",
                "agents": [
                    "PlannerAgent",
                    "RiskAgent",
                    "FinanceAgent",
                ],
            },
            created_at=now,
        ),
        #
        # Use the policy that already exists on the server.
        #
        policy=PolicyReference(
            name="vendor-payment",
            version="1.0.0",
            schema_version="1.0.0",
        ),
        signals={
            "vendorVerified": True,
            "paymentApproved": True,
            "amount": 1000,
            #
            # Example multi-agent signals.
            #
            "plannerApproved": True,
            "riskApproved": True,
            "financeApproved": True,
        },
        status="RECEIVED",
        created_at=now,
    )

    trust_record = client.execution.execute(transaction)

    Path(__file__).with_name(".transaction_id").write_text(
        transaction_id,
        encoding="utf-8",
    )

    print(
        json.dumps(
            asdict(trust_record),
            indent=2,
            default=str,
        )
    )


if __name__ == "__main__":
    main()
