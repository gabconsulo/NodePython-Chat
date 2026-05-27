import json
from datetime import datetime, timezone


def _emit(level: str, message: str, **metadata) -> None:
    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "service": "chat-service",
        "level": level,
        "message": message,
        **metadata,
    }
    print(json.dumps(payload, ensure_ascii=True), flush=True)


def info(message: str, **metadata) -> None:
    _emit("info", message, **metadata)


def warning(message: str, **metadata) -> None:
    _emit("warn", message, **metadata)


def error(message: str, **metadata) -> None:
    _emit("error", message, **metadata)
