import os
import platform
from pydantic_settings import BaseSettings

def get_default_scan_root() -> str:
    if os.getenv("DOCKER_MODE") == "true":
        return os.getenv("NAS_ROOT", "/mnt/nas")
    system = platform.system()
    if system == "Windows":
        return os.getenv("NAS_ROOT", "C:\\")
    elif system == "Darwin":
        return os.getenv("NAS_ROOT", "/Users")
    else:
        return os.getenv("NAS_ROOT", "/")

class Settings(BaseSettings):
    DOCKER_MODE: bool = os.getenv("DOCKER_MODE", "false").lower() == "true"
    NAS_ROOT: str = get_default_scan_root()
    DB_PATH: str = os.getenv("DB_PATH", "sqlite:///./maxwells_demon.db")
    WORKERS: int = int(os.getenv("WORKERS", "2"))
    
    # 转换为 SQLAlchemy URL 格式
    @property
    def database_url(self) -> str:
        if self.DB_PATH.startswith("sqlite:///"):
            return self.DB_PATH
        return f"sqlite:///{self.DB_PATH}"

settings = Settings()
