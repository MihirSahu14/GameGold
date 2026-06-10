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
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days

    # AI — swap model string to switch providers (Groq dev, Claude prod)
    llm_model: str = "groq/llama-3.3-70b-versatile"
    llm_api_key: str

    # CORS
    cors_origins: list[str] = ["http://localhost:3000", "https://gamegold.vercel.app"]


settings = Settings()  # type: ignore[call-arg]
