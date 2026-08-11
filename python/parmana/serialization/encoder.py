"""
Parmana Model Encoder.

Encode Parmana domain models into Runtime JSON.
"""

from __future__ import annotations

from dataclasses import asdict, is_dataclass
from datetime import datetime, timezone
from typing import Any


def _camel(name: str) -> str:
    """
    Convert snake_case to camelCase.
    """

    parts = name.split("_")

    return parts[0] + "".join(part.capitalize() for part in parts[1:])


def encode(value: Any) -> Any:
    """
    Encode Parmana models into Runtime JSON.
    """

    #
    # Dataclass
    #
    if is_dataclass(value):
        # `is_dataclass` narrows to `DataclassInstance | type[DataclassInstance]`;
        # `encode()` is only ever called with instances, never a class.
        fields = asdict(value)  # type: ignore[arg-type]

        # Every `| None = None` dataclass field the generator produces
        # comes from a TS *optional* (`foo?:`) property, never a
        # `| null` required one (generate_models.ts has no mapping for
        # that at all) -- so an unset field here means "absent",
        # exactly like the `undefined` JSON.stringify drops on the
        # Runtime side. Sending it back as an explicit `null` instead
        # changes what a re-hash (e.g. RefusalApi.verify(), which
        # re-hashes whatever canonical bytes it receives) computes,
        # breaking verification on a serialization difference alone,
        # not a real integrity problem.
        return {
            _camel(key): encode(item)
            for key, item in fields.items()
            if item is not None
        }

    #
    # Dictionary
    #
    if isinstance(value, dict):
        return {_camel(key): encode(item) for key, item in value.items()}

    #
    # List
    #
    if isinstance(value, list):
        return [encode(item) for item in value]

    #
    # datetime
    #
    # Matches JS's `Date.prototype.toISOString()` exactly (millisecond
    # precision, "Z" suffix) rather than Python's own `isoformat()`
    # default (microsecond precision, "+00:00" suffix): a decoded
    # RefusalRecord/ExecutionTrustRecord that gets sent straight back to
    # the Runtime (e.g. RefusalApi.verify(), which re-hashes whatever
    # canonical bytes it receives) must round-trip to the exact same
    # string the Runtime originally hashed and signed, or the signature
    # check fails on a formatting difference alone.
    if isinstance(value, datetime):
        return (
            value.astimezone(timezone.utc)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z")
        )

    #
    # Primitive
    #
    return value
