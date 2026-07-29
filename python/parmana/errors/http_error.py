from __future__ import annotations

from collections.abc import Callable

from .api_error import ApiError


class ParmanaHttpError(ApiError):
    """
    Base class for errors raised from a non-2xx Runtime HTTP response.

    Subclasses map to specific status codes so callers can catch a
    specific failure mode instead of pattern-matching on a message string.
    """

    status_code: int = 0

    def __init__(
        self,
        message: str,
        *,
        status_code: int,
        code: str = "HTTP_ERROR",
        request_id: str | None = None,
    ) -> None:
        super().__init__(
            message,
            code=code,
            request_id=request_id,
        )

        self.status_code = status_code


class ValidationError(ParmanaHttpError):
    """
    Raised on HTTP 400.

    The Runtime rejected the request body (for example, an invalid
    businessTransactionId or a missing required field).
    """

    def __init__(
        self,
        message: str,
        *,
        request_id: str | None = None,
    ) -> None:
        super().__init__(
            message,
            status_code=400,
            code="VALIDATION_ERROR",
            request_id=request_id,
        )


class AuthenticationError(ParmanaHttpError):
    """
    Raised on HTTP 401.
    """

    def __init__(
        self,
        message: str,
        *,
        request_id: str | None = None,
    ) -> None:
        super().__init__(
            message,
            status_code=401,
            code="AUTHENTICATION_ERROR",
            request_id=request_id,
        )


class AuthorizationError(ParmanaHttpError):
    """
    Raised on HTTP 403.

    The caller is authenticated, but is not permitted to assert the
    specific authority.principalId on this request (isPrincipalAllowed,
    packages/api/src/routes/execute.ts and transactions.ts). Distinct
    from AuthenticationError (401, no valid credential at all) -- this is
    "who you are is known; you can't act as this principal."
    """

    def __init__(
        self,
        message: str,
        *,
        request_id: str | None = None,
    ) -> None:
        super().__init__(
            message,
            status_code=403,
            code="AUTHORIZATION_ERROR",
            request_id=request_id,
        )


class ExecutionRejectedError(ParmanaHttpError):
    """
    Raised when Policy evaluation rejects a Business Transaction.

    Reached over HTTP 500, code RUNTIME_ERROR, with a message starting
    "Execution rejected:" (packages/api/src/middleware/error-handler.ts;
    see docs/site/api-reference/error-catalog.mdx). Not a dedicated
    status code of its own -- a well-formed request whose business
    decision was no, not a client error and not an uncategorized server
    failure.
    """

    def __init__(
        self,
        message: str,
        *,
        request_id: str | None = None,
    ) -> None:
        super().__init__(
            message,
            status_code=500,
            code="EXECUTION_REJECTED",
            request_id=request_id,
        )


class NotFoundError(ParmanaHttpError):
    """
    Raised on HTTP 404.
    """

    def __init__(
        self,
        message: str,
        *,
        request_id: str | None = None,
    ) -> None:
        super().__init__(
            message,
            status_code=404,
            code="NOT_FOUND",
            request_id=request_id,
        )


class ConflictError(ParmanaHttpError):
    """
    Raised on HTTP 409.

    For example, a duplicate Business Transaction (see
    DuplicateBusinessTransactionError in packages/runtime).
    """

    def __init__(
        self,
        message: str,
        *,
        request_id: str | None = None,
    ) -> None:
        super().__init__(
            message,
            status_code=409,
            code="CONFLICT",
            request_id=request_id,
        )


class ServerError(ParmanaHttpError):
    """
    Raised on any HTTP 5xx response.
    """

    def __init__(
        self,
        message: str,
        *,
        status_code: int = 500,
        request_id: str | None = None,
    ) -> None:
        super().__init__(
            message,
            status_code=status_code,
            code="SERVER_ERROR",
            request_id=request_id,
        )


_STATUS_MAP: dict[int, Callable[..., ParmanaHttpError]] = {
    400: ValidationError,
    401: AuthenticationError,
    403: AuthorizationError,
    404: NotFoundError,
    409: ConflictError,
}


def build_http_error(
    status_code: int,
    message: str,
    *,
    code: str | None = None,
    request_id: str | None = None,
) -> ParmanaHttpError:
    """
    Constructs the specific ParmanaHttpError subclass for a response.

    Classification is primarily by HTTP status. The one exception:
    Policy rejection has no dedicated status of its own -- it reaches
    the caller as an uncategorized HTTP 500 with code RUNTIME_ERROR and
    a message starting "Execution rejected:" (see
    packages/api/src/middleware/error-handler.ts and
    docs/site/api-reference/error-catalog.mdx). That specific
    status+code+message combination raises ExecutionRejectedError;
    every other 5xx falls back to ServerError, and any other unmapped
    status code to the ParmanaHttpError base class.
    """

    if (
        status_code == 500
        and code == "RUNTIME_ERROR"
        and message.startswith("Execution rejected")
    ):
        return ExecutionRejectedError(message, request_id=request_id)

    error_type = _STATUS_MAP.get(status_code)

    if error_type is not None:
        return error_type(message, request_id=request_id)

    if 500 <= status_code < 600:
        return ServerError(
            message,
            status_code=status_code,
            request_id=request_id,
        )

    return ParmanaHttpError(
        message,
        status_code=status_code,
        request_id=request_id,
    )
