import os


def read_int(name: str, default: int) -> int:
    value = os.getenv(name)
    try:
        return int(value) if value is not None else default
    except ValueError:
        return default


def read_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


PORT = read_int("CHAT_SERVICE_PORT", 8081)
DATABASE_PATH = os.getenv("CHAT_DB_PATH", os.path.join("data", "chat.db"))
MODERATION_SERVICE_URL = os.getenv("MODERATION_SERVICE_URL", "http://127.0.0.1:8082")
REQUEST_TIMEOUT_SECONDS = read_int("MODERATION_REQUEST_TIMEOUT_SECONDS", 1)
MAX_RETRIES = read_int("MODERATION_MAX_RETRIES", 2)
ALLOW_DEGRADED_WRITES = read_bool("ALLOW_DEGRADED_WRITES", True)
MAX_MESSAGE_LENGTH = read_int("MAX_MESSAGE_LENGTH", 280)
