from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    app_name: str = "GameGold API"
    debug: bool = False

    # MongoDB
    mongodb_url: str
    mongodb_db: str = "gamegold"

    # Auth
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_expire_minutes: int = 15
    refresh_expire_days: int = 30

    # Auth cookies — frontend (Vercel) and backend (Render) are different
    # domains, so prod cookies must be SameSite=None + Secure. Local dev runs
    # both over plain http on "localhost", which needs Lax + non-Secure.
    cookie_secure: bool = False
    cookie_samesite: str = "lax"

    # AI — swap model string to switch providers (Groq dev, Claude prod)
    llm_model: str = "anthropic/claude-haiku-4-5"
    llm_api_key: str
    # Free trial on the key above — global cap per UTC day; own keys are unlimited
    trial_daily_budget_usd: float = 1.0
    # Fernet key that encrypts users' own LLM keys; empty = own keys disabled (503)
    llm_key_secret: str = ""

    # Image generation (Phase 3) — optional; sprite gen returns a clear error without it
    replicate_api_token: str = ""

    # Password reset email — unset means log-only (no provider wired yet)
    email_provider: str = ""

    # Google + GitHub sign-in — a provider with an empty id/secret answers 503
    google_client_id: str = ""
    google_client_secret: str = ""
    github_client_id: str = ""
    github_client_secret: str = ""
    # Fixed redirect targets for the OAuth flow (never user-controlled)
    frontend_url: str = "http://localhost:3000"
    api_public_url: str = "http://localhost:8000"

    # CORS
    cors_origins: list[str] = ["http://localhost:3000", "https://gamegold.vercel.app"]


settings = Settings()  # type: ignore[call-arg]
