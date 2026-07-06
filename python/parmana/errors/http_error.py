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


class ExecutionRejectedError(ParmanaHttpError):
    """
    Raised on HTTP 403.

    The Runtime understood the request but refused to execute it (for
    example, a Decision or Authorization was rejected).
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
    403: ExecutionRejectedError,
    404: NotFoundError,
    409: ConflictError,
}


def build_http_error(
    status_code: int,
    message: str,
    *,
    request_id: str | None = None,
) -> ParmanaHttpError:
    """
    Constructs the specific ParmanaHttpError subclass for a status code.

    Falls back to ServerError for 5xx and to the ParmanaHttpError base
    class for any other unmapped status code.
    """

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
