import logging

from app.config import settings

logger = logging.getLogger(__name__)


async def send_password_reset(email: str, reset_url: str) -> None:
    # ponytail: only the log-only default path is implemented — no email
    # provider is configured yet. Wiring Resend/SES in here is a manual step
    # once settings.email_provider is set to a real provider name.
    if not settings.email_provider:
        logger.info("Password reset requested for %s: %s", email, reset_url)
        return
