from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="APP_")

    # MSSQL connection, e.g.
    # mssql+pyodbc://user:pass@host/dbname?driver=ODBC+Driver+18+for+SQL+Server
    database_url: str = "mssql+pyodbc://localhost/warehouse_attendance?driver=ODBC+Driver+18+for+SQL+Server&trusted_connection=yes"

    secret_key: str = "change-me-in-production"
    access_token_minutes: int = 30
    refresh_token_days: int = 14

    default_sampling_fps: float = 1.5
    attendance_cooldown_seconds: int = 300
    similarity_threshold: float = 0.4
    detection_confidence_threshold: float = 0.5


settings = Settings()
