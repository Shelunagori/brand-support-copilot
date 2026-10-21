class NugenError(Exception):
    """Base class for Nugen client errors."""


class NugenAPIError(NugenError):
    def __init__(self, status_code: int, detail: str, operation: str) -> None:
        self.status_code = status_code
        self.detail = detail
        self.operation = operation
        super().__init__(f"{operation} failed with HTTP {status_code}: {detail}")

    @property
    def retryable(self) -> bool:
        return self.status_code == 429 or self.status_code >= 500


class NugenTimeoutError(NugenError):
    """A polling loop or request exceeded its deadline."""


class SpendLimitExceeded(NugenError):
    """A paid call would push total estimated spend past the configured hard limit."""
