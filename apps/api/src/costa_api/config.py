from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    app_env: str = "development"
    app_secret_key: str = "dev-secret-change-me"
    app_cors_origins: str = "http://localhost:3000"
    log_level: str = "INFO"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.app_cors_origins.split(",") if o.strip()]

    # Database
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "costa_resiliente"
    postgres_user: str = "costa"
    postgres_password: str = "change_me_in_production"

    # Read-only AI user (used by ai/ tools — no write access)
    postgres_ai_user: str = "costa_ai_ro"
    postgres_ai_password: str = "change_me_in_production"

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def database_ai_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_ai_user}:{self.postgres_ai_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # MinIO
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "change_me_in_production"
    minio_use_ssl: bool = False
    minio_bucket_rasters: str = "rasters"
    minio_bucket_models: str = "models"

    # LLM — accepts both new (LLM_*) and old (OLLAMA_*) env var names
    llm_provider: str = "ollama"
    llm_base_url: str = Field(
        default="http://localhost:11434",
        validation_alias=AliasChoices("LLM_BASE_URL", "OLLAMA_HOST"),
    )
    llm_primary_model: str = Field(
        default="qwen2.5:7b-instruct-q4_K_M",
        validation_alias=AliasChoices("LLM_PRIMARY_MODEL", "OLLAMA_PRIMARY_MODEL"),
    )
    llm_fast_model: str = Field(
        default="gemma2:2b",
        validation_alias=AliasChoices("LLM_FAST_MODEL", "OLLAMA_FALLBACK_MODEL"),
    )
    llm_embed_model: str = "nomic-embed-text"
    llm_timeout_chat: float = 30.0   # 30s per call; keyword fallback handles slowness
    llm_timeout_embed: float = 10.0
    llm_max_tool_iters: int = 4
    llm_daily_token_budget: int = 500_000

    # Legacy compat
    @property
    def ollama_host(self) -> str:
        return self.llm_base_url

    @property
    def ollama_primary_model(self) -> str:
        return self.llm_primary_model

    # Share tokens
    share_token_secret: str = "dev-share-secret-change-me"
    share_token_ttl_days: int = 30

    # Lima AOI
    lima_bbox_west: float = -77.2
    lima_bbox_south: float = -12.5
    lima_bbox_east: float = -76.7
    lima_bbox_north: float = -11.7

    # Twilio SMS (optional — stub fires if not set; only costs money when ACCOUNT_SID is configured)
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""  # E.164 format, e.g. +15005550006

    @property
    def twilio_enabled(self) -> bool:
        return bool(self.twilio_account_sid and self.twilio_auth_token and self.twilio_from_number)


settings = Settings()
