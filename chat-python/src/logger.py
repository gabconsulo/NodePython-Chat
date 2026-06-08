# Importacoes para logging estruturado
import json
from datetime import datetime, timezone


# Funcao interna que estrutura e emite logs em formato JSON
def _emit(level: str, message: str, **metadata) -> None:
    # Cria payload estruturado com timestamp, nivel, servico e dados adicionais
    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "service": "chat-service",
        "level": level,
        "message": message,
        **metadata,
    }
    # Emite como JSON para facilitar parsing em ferramentas de logging
    print(json.dumps(payload, ensure_ascii=True), flush=True)


# Log informativo - para eventos normais da aplicacao
def info(message: str, **metadata) -> None:
    _emit("info", message, **metadata)


# Log de aviso - para situacoes anormais mas recuperaveis
def warning(message: str, **metadata) -> None:
    _emit("warn", message, **metadata)


# Log de erro - para situacoes que requerem atencao
def error(message: str, **metadata) -> None:
    _emit("error", message, **metadata)
