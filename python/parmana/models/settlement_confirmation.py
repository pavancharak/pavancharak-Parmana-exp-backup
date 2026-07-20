"""
GENERATED FILE -- DO NOT EDIT BY HAND.

Generated from packages/shared/src/domain/settlement-confirmation.ts by
python/scripts/generate_models.ts. Run "npm run
generate:python-models" to regenerate.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum


class SettlementStatus(str, Enum):
    SETTLED = "SETTLED"
    SETTLEMENT_FAILED = "SETTLEMENT_FAILED"


@dataclass(frozen=True)
class SettlementConfirmation:
    confirmation_id: str

    business_transaction_id: str

    webhook_event_id: str

    razorpay_refund_id: str

    status: SettlementStatus

    fetched_refund_status: str

    confirmation_hash: str

    signature: str

    algorithm: str

    issued_at: datetime

    receipt_id: str | None = None
