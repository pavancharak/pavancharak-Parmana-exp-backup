"""
Parmana HTTP Transport.

Canonical HTTP transport implementation for the Parmana Python SDK.
"""

from __future__ import annotations

import logging
from typing import Any, TypeVar, overload

import requests
from requests import Response
from requests.adapters import HTTPAdapter
from requests.exceptions import RequestException, Timeout
from urllib3.util.retry import Retry

from parmana.config.transport import Transport
from parmana.errors.http_error import build_http_error
from parmana.errors.network_error import NetworkError
from parmana.errors.network_error import TimeoutError as ParmanaTimeoutError
from parmana.serialization import decode

logger = logging.getLogger("parmana")

T = TypeVar("T")


class HttpTransport(Transport):
    """
    Canonical HTTP transport.

    Responsibilities
    ----------------
    - Send HTTP requests over a reused connection pool
    - Retry idempotent (GET) requests with backoff
    - Parse Runtime responses
    - Raise structured SDK exceptions for non-2xx responses
    - Decode Runtime responses into Parmana models
    """

    DEFAULT_TIMEOUT = 30
    DEFAULT_MAX_RETRIES = 3
    DEFAULT_BACKOFF_FACTOR = 0.5

    def __init__(
        self,
        endpoint: str,
        *,
        api_key: str | None = None,
        timeout: int = DEFAULT_TIMEOUT,
        max_retries: int = DEFAULT_MAX_RETRIES,
        backoff_factor: float = DEFAULT_BACKOFF_FACTOR,
        debug: bool = False,
    ) -> None:
        self._endpoint = endpoint.rstrip("/")
        self._timeout = timeout

        if debug:
            logger.setLevel(logging.DEBUG)

            if not logger.handlers:
                logger.addHandler(logging.StreamHandler())

        #
        # Reused connection pool.
        #
        # GET requests are safe to retry (idempotent); POST is not
        # retried here since the Runtime does not guarantee idempotency
        # for execute/verify/receipt/replay submissions.
        #
        retry = Retry(
            total=max_retries,
            backoff_factor=backoff_factor,
            status_forcelist=[502, 503, 504],
            allowed_methods=frozenset({"GET"}),
            raise_on_status=False,
        )

        adapter = HTTPAdapter(max_retries=retry)

        self._session = requests.Session()
        self._session.mount("http://", adapter)
        self._session.mount("https://", adapter)

        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        if api_key is not None:
            headers["Authorization"] = f"Bearer {api_key}"

        self._session.headers.update(headers)

    @property
    def endpoint(self) -> str:
        """
        Parmana Runtime endpoint.
        """
        return self._endpoint

    @overload
    def send(
        self,
        *,
        method: str,
        path: str,
        body: Any | None = None,
        response_model: None = None,
        non_throwing_statuses: frozenset[int] = frozenset(),
    ) -> Any: ...

    @overload
    def send(
        self,
        *,
        method: str,
        path: str,
        body: Any | None = None,
        response_model: type[T],
        non_throwing_statuses: frozenset[int] = frozenset(),
    ) -> T: ...

    def send(
        self,
        *,
        method: str,
        path: str,
        body: Any | None = None,
        response_model: type[T] | None = None,
        non_throwing_statuses: frozenset[int] = frozenset(),
    ) -> T | Any:
        """
        Send a request to the Parmana Runtime.

        non_throwing_statuses lists status codes that must be returned as
        an ordinary payload instead of raising, because this specific
        route's response body at that specific status is not the shared
        {error, code?} envelope. Today exactly one route needs this: see
        PolicyApi.validate.
        """

        url = f"{self._endpoint}{path}"

        logger.debug("request method=%s url=%s body=%r", method, url, body)

        try:
            response = self._session.request(
                method=method,
                url=url,
                json=body,
                timeout=self._timeout,
            )

        except Timeout as exc:
            raise ParmanaTimeoutError() from exc

        except RequestException as exc:
            raise NetworkError() from exc

        payload = self._parse_response(
            response,
            non_throwing_statuses=non_throwing_statuses,
        )

        logger.debug("response status=%s payload=%r", response.status_code, payload)

        if response_model is None:
            return payload

        return decode(
            payload,
            response_model,
        )

    def _parse_response(
        self,
        response: Response,
        *,
        non_throwing_statuses: frozenset[int] = frozenset(),
    ) -> Any:
        """
        Parse Runtime response.

        Raises a `ParmanaHttpError` subclass matching the response status
        code for any non-2xx response, except a status listed in
        non_throwing_statuses, which is returned like an ordinary
        payload; never returns any other error body as if it were a
        successful result.
        """

        if response.ok or response.status_code in non_throwing_statuses:

            if not response.content:
                return None

            return response.json()

        try:
            payload = response.json()

            message = payload.get("error") or payload.get("message") or response.reason
            code = payload.get("code")

        except Exception:
            message = response.text or response.reason
            code = None

        raise build_http_error(
            response.status_code,
            message,
            code=code,
        )
