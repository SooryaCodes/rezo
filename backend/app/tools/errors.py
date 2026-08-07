"""Failures that the tool layer raises before anything irreversible happens."""


class ToolError(Exception):
    """Base for every failure surfaced by the capability layer."""

    code = "tool_error"

    def __init__(self, message: str, **detail):
        super().__init__(message)
        self.message = message
        self.detail = detail

    def as_dict(self) -> dict:
        return {"error": self.code, "message": self.message, **self.detail}


class GuardrailViolation(ToolError):
    """A rule the model is not permitted to talk its way around.

    Raised before execution, never after. Every instance of this is a case where
    an agent asked for something the deterministic layer refused.
    """

    code = "guardrail_violation"


class CapabilityUnavailable(ToolError):
    """The store has not enabled this capability. Callers degrade gracefully
    rather than failing the dispute."""

    code = "capability_unavailable"


class NotFound(ToolError):
    code = "not_found"
