"""
Parmana Client.

Main entry point for the Parmana Python SDK.
"""

from __future__ import annotations

from parmana.api.execution_api import ExecutionApi
from parmana.api.policy_api import PolicyApi
from parmana.api.receipt_api import ReceiptApi
from parmana.api.replay_api import ReplayApi
from parmana.api.transaction_api import TransactionApi
from parmana.api.trust_record_api import TrustRecordApi
from parmana.api.verification_api import VerificationApi
from parmana.transport.http_transport import HttpTransport
from parmana.version import __version__


class ParmanaClient:
    """
    Parmana SDK Client.

    Parmana ensures AI executes only policy-compliant actions.

    Example
    -------
    >>> client = ParmanaClient(
    ...     endpoint="http://localhost:3000",
    ... )

    >>> trust_record = client.execution.execute(transaction)

    >>> verification = client.verification.verify(
    ...     transaction.business_transaction_id,
    ... )
    """

    DEFAULT_TIMEOUT = HttpTransport.DEFAULT_TIMEOUT

    DEFAULT_MAX_RETRIES = HttpTransport.DEFAULT_MAX_RETRIES

    DEFAULT_BACKOFF_FACTOR = HttpTransport.DEFAULT_BACKOFF_FACTOR

    def __init__(
        self,
        *,
        endpoint: str,
        timeout: int = DEFAULT_TIMEOUT,
        max_retries: int = DEFAULT_MAX_RETRIES,
        backoff_factor: float = DEFAULT_BACKOFF_FACTOR,
        debug: bool = False,
    ) -> None:
        """
        Create a Parmana SDK client.

        This client is synchronous only. There is no async variant.

        Parameters
        ----------
        endpoint:
            Base URL of the Parmana Runtime.

        timeout:
            HTTP timeout in seconds, applied per request.

        max_retries:
            Retry attempts for idempotent (GET) requests that fail with
            a connection error or a 502/503/504 response. POST requests
            (execute, verify, receipt, replay) are never retried.

        backoff_factor:
            Exponential backoff factor between retries, in seconds.

        debug:
            Enable request/response debug logging on the "parmana" logger.
        """

        self._transport = HttpTransport(
            endpoint=endpoint,
            timeout=timeout,
            max_retries=max_retries,
            backoff_factor=backoff_factor,
            debug=debug,
        )

        #
        # APIs
        #

        self.execution = ExecutionApi(
            self._transport,
        )

        self.verification = VerificationApi(
            self._transport,
        )

        self.replay = ReplayApi(
            self._transport,
        )

        self.receipt = ReceiptApi(
            self._transport,
        )

        self.transactions = TransactionApi(
            self._transport,
        )

        self.trust_records = TrustRecordApi(
            self._transport,
        )

        self.policy = PolicyApi(
            self._transport,
        )

    @property
    def endpoint(self) -> str:
        """
        Parmana Runtime endpoint.
        """
        return self._transport.endpoint

    @property
    def version(self) -> str:
        """
        Parmana SDK version.
        """
        return __version__

    def __repr__(self) -> str:
        return (
            f"{self.__class__.__name__}("
            f"endpoint='{self.endpoint}', "
            f"version='{self.version}')"
        )
