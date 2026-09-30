from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, ValidationInfo, field_validator
from pydantic.alias_generators import to_camel

LlmProvider = Literal["openrouter", "anthropic", "openai", "gemini", "groq"]

_CAMEL = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class LlmConfigUpdate(BaseModel):
    provider: LlmProvider
    model: str  # full LiteLLM string, e.g. "openrouter/anthropic/claude-sonnet-4.5"
    # No constraints here on purpose: a 422 echoes the failing field's input,
    # and the key must never appear in a response. Length is checked in the route.
    api_key: str

    model_config = _CAMEL

    @field_validator("model")
    @classmethod
    def _model_matches_provider(cls, v: str, info: ValidationInfo) -> str:
        v = v.strip()
        provider = info.data.get("provider")
        if provider and (not v.startswith(f"{provider}/") or len(v) <= len(provider) + 1 or len(v) > 200):
            raise ValueError(f"Model must start with '{provider}/' followed by a model name")
        return v


class TrialBudgetOut(BaseModel):
    budget_usd: float
    spent_usd: float
    remaining_usd: float

    model_config = _CAMEL


class LlmConfigOut(BaseModel):
    provider: Optional[LlmProvider] = None
    model: Optional[str] = None
    key_last4: Optional[str] = None
    using_own_key: bool
    trial: TrialBudgetOut

    model_config = _CAMEL
