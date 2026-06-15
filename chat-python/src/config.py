# Importa modulos para ler variaveis de ambiente
import os


# Funcao auxiliar para ler inteiros das variaveis de ambiente com fallback
def read_int(name: str, default: int) -> int:
    value = os.getenv(name)
    try:
        return int(value) if value is not None else default
    except ValueError:
        return default


# Funcao auxiliar para ler booleanos das variaveis de ambiente com fallback
def read_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    # Aceita varios formatos de valores verdadeiros
    return value.lower() in {"1", "true", "yes", "on"}


# Porta em que o servico de chat escuta (Render injeta PORT; local usa CHAT_SERVICE_PORT)
PORT = read_int("PORT", read_int("CHAT_SERVICE_PORT", 8081))
# Caminho do banco de dados SQLite (padrao data/chat.db)
DATABASE_PATH = os.getenv("CHAT_DB_PATH", os.path.join("data", "chat.db"))
# URL do servico de moderacao (padrao localhost:8082)
MODERATION_SERVICE_URL = os.getenv("MODERATION_SERVICE_URL", "http://127.0.0.1:8082")
# Timeout em segundos para requisicoes ao servico de moderacao (padrao 1s)
REQUEST_TIMEOUT_SECONDS = read_int("MODERATION_REQUEST_TIMEOUT_SECONDS", 1)
# Numero de tentativas de retry para requisicoes ao servico de moderacao (padrao 2)
MAX_RETRIES = read_int("MODERATION_MAX_RETRIES", 2)
# Se true, permite continuar aceitando mensagens mesmo se moderacao falhar (modo degradado)
ALLOW_DEGRADED_WRITES = read_bool("ALLOW_DEGRADED_WRITES", True)
# Tamanho maximo de uma mensagem em caracteres (padrao 280)
MAX_MESSAGE_LENGTH = read_int("MAX_MESSAGE_LENGTH", 280)
