"""The signed-in user's own settings — currently their LLM provider + key (BYOK)."""
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app.config import settings
from app.core.rate_limit import limiter
from app.db.mongodb import get_db
from app.models.llm import LlmConfigOut, LlmConfigUpdate, TrialBudgetOut
from app.prompts.health_prompt import HEALTH_SYSTEM_PROMPT, HEALTH_USER_PROMPT
from app.routers.auth import get_current_user
from app.services.llm_keys import OwnKeysNotConfigured, encrypt_key
from app.services.llm_utils import call_with_key, trial_spent_usd

router = APIRouter(prefix="/me", tags=["me"])

KEYS_NOT_CONFIGURED = "Own keys are not configured on this server"


async def _llm_out(llm: dict | None) -> LlmConfigOut:
    budget = settings.trial_daily_budget_usd
    spent = await trial_spent_usd()
    trial = TrialBudgetOut(budget_usd=budget, spent_usd=round(spent, 4), remaining_usd=round(max(budget - spent, 0.0), 4))
    if not llm:
        return LlmConfigOut(using_own_key=False, trial=trial)
    return LlmConfigOut(
        provider=llm["provider"], model=llm["model"], key_last4=llm["key_last4"], using_own_key=True, trial=trial
    )


@router.get("/llm", response_model=LlmConfigOut, response_model_by_alias=True)
async def get_llm(current_user: dict = Depends(get_current_user)):
    return await _llm_out(current_user.get("llm"))


@router.put("/llm", response_model=LlmConfigOut, response_model_by_alias=True)
@limiter.limit("5/minute")
async def put_llm(
    request: Request, response: Response, data: LlmConfigUpdate, current_user: dict = Depends(get_current_user)
):
    key = data.api_key.strip()
    if not 8 <= len(key) <= 500:
        raise HTTPException(status_code=400, detail="That doesn't look like an API key")
    try:
        encrypted = encrypt_key(key)
    except OwnKeysNotConfigured:
        raise HTTPException(status_code=503, detail=KEYS_NOT_CONFIGURED)

    # One tiny real call so a bad key/model fails here, not mid-generation.
    try:
        await call_with_key(HEALTH_SYSTEM_PROMPT, HEALTH_USER_PROMPT, 5, data.provider, data.model, key)
    except ValueError as exc:  # already scrubbed
        raise HTTPException(status_code=400, detail=str(exc))

    llm = {
        "provider": data.provider,
        "model": data.model,
        "key_encrypted": encrypted,
        "key_last4": key[-4:],
        "updated_at": datetime.now(timezone.utc),
    }
    await get_db().users.update_one({"_id": ObjectId(current_user["_id"])}, {"$set": {"llm": llm}})
    return await _llm_out(llm)


@router.delete("/llm", response_model=LlmConfigOut, response_model_by_alias=True)
async def delete_llm(current_user: dict = Depends(get_current_user)):
    await get_db().users.update_one({"_id": ObjectId(current_user["_id"])}, {"$unset": {"llm": ""}})
    return await _llm_out(None)
