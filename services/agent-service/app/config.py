from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/aicommerce"
    REDIS_URL: str = "redis://localhost:6379"
    LOG_LEVEL: str = "info"
    DRY_RUN: bool = True

    class Config:
        env_file = ".env"


settings = Settings()
