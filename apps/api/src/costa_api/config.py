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

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
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

    # Ollama
    ollama_host: str = "http://localhost:11434"
    ollama_primary_model: str = "gemma4:e4b"
    ollama_fallback_model: str = "qwen3:14b"

    # Share tokens
    share_token_secret: str = "dev-share-secret-change-me"
    share_token_ttl_days: int = 30

    # Lima AOI
    lima_bbox_west: float = -77.2
    lima_bbox_south: float = -12.5
    lima_bbox_east: float = -76.7
    lima_bbox_north: float = -11.7


settings = Settings()
