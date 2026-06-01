import os
from urllib.parse import quote_plus
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DB_HOST: str = "172.20.0.3"
    DB_PORT: int = 5432
    DB_USER: str = "Shyamai"
    DB_PASSWORD: str = "Shyamibm@867100"
    DB_NAME: str = "shyamai_jobs"

    SECRET_KEY: str = "shyamai-jobs-secret-key"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    APIFY_API_TOKEN: str = ""

    # Free job APIs
    ADZUNA_APP_ID: str = ""
    ADZUNA_APP_KEY: str = ""
    RAPIDAPI_KEY: str = ""

    APP_NAME: str = "ShyamAI Jobs"
    DEBUG: bool = False
    BACKEND_PORT: int = 8001
    CORS_ORIGINS: str = "http://localhost:3001,http://localhost:5173"

    class Config:
        env_file = "/root/SHYAMAI_JOBS/.env"
        extra = "ignore"

    @property
    def DATABASE_URL(self) -> str:
        pwd = quote_plus(self.DB_PASSWORD)
        return f"postgresql+psycopg2://{self.DB_USER}:{pwd}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    @property
    def ASYNC_DATABASE_URL(self) -> str:
        pwd = quote_plus(self.DB_PASSWORD)
        return f"postgresql+asyncpg://{self.DB_USER}:{pwd}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]


settings = Settings()
