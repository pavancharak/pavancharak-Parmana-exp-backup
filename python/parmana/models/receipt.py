"""
GENERATED FILE -- DO NOT EDIT BY HAND.

Generated from packages/shared/src/domain/receipt.ts by
python/scripts/generate_models.ts. Run "npm run
generate:python-models" to regenerate.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class Receipt:
    receipt_id: str

    business_transaction_id: str

    trust_record_hash: str

    receipt_hash: str

    signature: str

    algorithm: str

    issued_at: datetime

    execution_id: str | None = None
