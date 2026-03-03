from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Core
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/aicommerce"
    REDIS_URL: str = "redis://localhost:6379"
    LOG_LEVEL: str = "info"
    DRY_RUN: bool = True

    # LLM
    LLM_PROVIDER: str = "mock"  # anthropic | openai | mock
    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    LLM_MODEL: str = "claude-sonnet-4-20250514"
    LLM_MAX_TOKENS: int = 4096
    LLM_TEMPERATURE: float = 0.3

    # API Node (internal communication)
    API_NODE_URL: str = "http://api-node:4000"
    API_NODE_TOKEN: str = ""

    # S3 / MinIO
    S3_ENDPOINT: str = "http://minio:9000"
    S3_ACCESS_KEY: str = "minioadmin"
    S3_SECRET_KEY: str = "minioadmin"
    S3_BUCKET: str = "ai-commerce-os"
    S3_REGION: str = "us-east-1"

    # Scheduler
    SCHEDULER_ENABLED: bool = False
    REPORTING_SCHEDULE_HOUR: int = 9
    REPORTING_SCHEDULE_MINUTE: int = 0
    SUPPORT_EMAIL_SCHEDULE_HOUR: int = 8
    SUPPORT_EMAIL_SCHEDULE_MINUTE: int = 30

    # Email (IMAP for SupportAgent)
    IMAP_HOST: Optional[str] = None
    IMAP_PORT: int = 993
    IMAP_USER: Optional[str] = None
    IMAP_PASSWORD: Optional[str] = None
    IMAP_USE_SSL: bool = True
    IMAP_FOLDER: str = "INBOX"

    # SMTP (for auto-reply)
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_USE_TLS: bool = True
    SMTP_FROM_NAME: str = "Soporte"
    SMTP_FROM_ADDRESS: Optional[str] = None

    # Agent thresholds
    OPS_HIGH_VALUE_THRESHOLD: float = 150.0
    OPS_UNPAID_HOURS_THRESHOLD: int = 24

    class Config:
        env_file = ".env"


settings = Settings()
