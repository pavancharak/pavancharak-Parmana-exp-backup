from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, TypeVar, overload

T = TypeVar("T")


class Transport(ABC):
    """
    Base transport abstraction.
    """

    @overload
    def send(
        self,
        *,
        method: str,
        path: str,
        body: Any | None = None,
        response_model: None = None,
    ) -> Any: ...

    @overload
    def send(
        self,
        *,
        method: str,
        path: str,
        body: Any | None = None,
        response_model: type[T],
    ) -> T: ...

    @abstractmethod
    def send(
        self,
        *,
        method: str,
        path: str,
        body: Any | None = None,
        response_model: type[T] | None = None,
    ) -> T | Any:
        """
        Send a request to the Parmana Runtime.
        """
        raise NotImplementedError
