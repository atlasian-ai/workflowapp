from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Supabase
    supabase_url: str = ""
    supabase_jwt_secret: str = ""
    supabase_service_key: str = ""

    # Database
    database_url: str = ""

    # Supabase Storage
    supabase_storage_bucket: str = "workflow-files"

    # Cloudflare R2 (legacy — kept for OCR worker compat, superseded by Supabase Storage)
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_name: str = "workflowapp-files"
    r2_public_url: str = ""

    # Redis (Railway Redis plugin injects REDIS_URL automatically)
    redis_url: str = "redis://localhost:6379"

    # Anthropic
    anthropic_api_key: str = ""

    # App
    secret_key: str = "dev-secret-key"
    frontend_url: str = "http://localhost:5173"


settings = Settings()
