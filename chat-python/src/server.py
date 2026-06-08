# Importacoes necessarias para criar um servidor HTTP em Python
import json
import os
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import logger
from config import (
    ALLOW_DEGRADED_WRITES,
    DATABASE_PATH,
    MAX_MESSAGE_LENGTH,
    MODERATION_SERVICE_URL,
    PORT,
)
from moderation_client import moderate_message, moderation_healthcheck
from storage import MessageRepository

# Instancia o repositorio de mensagens (acesso a base de dados)
repository = MessageRepository(DATABASE_PATH)


# Retorna a data/hora atual em formato ISO 8601 UTC
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# Envia uma resposta JSON com status code e payload
def json_response(handler: BaseHTTPRequestHandler, status_code: int, payload: dict) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status_code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


# Le o corpo JSON da requisicao
def read_json(handler: BaseHTTPRequestHandler) -> dict:
    content_length = int(handler.headers.get("Content-Length", "0"))
    raw_body = handler.rfile.read(content_length)
    if not raw_body:
        return {}
    return json.loads(raw_body.decode("utf-8"))


# Valida os campos obrigatorios da mensagem
def validate_message(payload: dict):
    username = (payload.get("username") or "").strip()
    room = (payload.get("room") or "geral").strip()
    content = (payload.get("content") or "").strip()

    # Validacoes de campo obrigatorio
    if not username:
        return None, "O campo username e obrigatorio."
    if not content:
        return None, "O campo content e obrigatorio."
    # Validacoes de tamanho maximo
    if len(username) > 40:
        return None, "O username deve ter no maximo 40 caracteres."
    if len(room) > 40:
        return None, "A sala deve ter no maximo 40 caracteres."
    if len(content) > MAX_MESSAGE_LENGTH:
        return None, f"A mensagem deve ter no maximo {MAX_MESSAGE_LENGTH} caracteres."

    # Retorna dados validados
    return {
        "username": username,
        "room": room or "geral",
        "content": content,
    }, None


# Handler que processa requisicoes HTTP do cliente
class ChatHandler(BaseHTTPRequestHandler):
    server_version = "DistributedChatPython/2.0"

    # Desabilita logs padrao do BaseHTTPRequestHandler (usamos logger estruturado)
    def log_message(self, format, *args):
        return

    # Trata requisicoes GET
    def do_GET(self):
        parsed_url = urlparse(self.path)

        # Endpoint de health check - mostra status do servico e seus dependentes
        if parsed_url.path == "/health":
            moderation_reachable = True
            moderation_error = None

            try:
                # Testa se servico de moderacao esta acessivel
                moderation_reachable = moderation_healthcheck()
            except Exception as error:
                moderation_reachable = False
                moderation_error = str(error)

            json_response(
                self,
                200,
                {
                    "service": "chat-service",
                    "healthy": repository.healthcheck(),
                    "database": os.path.abspath(DATABASE_PATH),
                    "degradedWritesEnabled": ALLOW_DEGRADED_WRITES,
                    "dependencies": {
                        "moderationServiceUrl": MODERATION_SERVICE_URL,
                        "moderationReachable": moderation_reachable,
                        "moderationError": moderation_error,
                    },
                },
            )
            return

        # Endpoint para listar mensagens com paginacao
        if parsed_url.path == "/messages":
            # Extrai parametros da query string
            params = parse_qs(parsed_url.query)
            room = (params.get("room", ["geral"])[0] or "geral").strip()

            try:
                # Limita paginacao entre 1 e 100 mensagens por vez
                limit = min(max(int(params.get("limit", ["50"])[0]), 1), 100)
                # after_id permite carregar mensagens novas (ID > after_id)
                after_id = max(int(params.get("afterId", ["0"])[0]), 0)
            except ValueError:
                json_response(self, 400, {"error": "Parametros limit e afterId devem ser numericos."})
                return

            # Busca mensagens no repositorio
            messages = repository.list_messages(room=room, limit=limit, after_id=after_id)
            json_response(
                self,
                200,
                {
                    "messages": messages,
                    "count": len(messages),
                },
            )
            return

        # Se nenhuma rota foi encontrada, retorna 404
        json_response(self, 404, {"error": "Endpoint nao encontrado."})

    # Trata requisicoes POST
    def do_POST(self):
        parsed_url = urlparse(self.path)

        # Apenas o endpoint /messages aceita POST
        if parsed_url.path != "/messages":
            json_response(self, 404, {"error": "Endpoint nao encontrado."})
            return

        # Le o corpo da requisicao
        try:
            payload = read_json(self)
        except json.JSONDecodeError:
            json_response(self, 400, {"error": "JSON invalido."})
            return

        # Valida os dados da mensagem
        data, error_message = validate_message(payload)
        if error_message:
            json_response(self, 400, {"error": error_message})
            return

        # Envia para o servico de moderacao
        try:
            moderation = moderate_message(data)
        except Exception as error:
            logger.error("moderation_unavailable", error=str(error))
            json_response(self, 503, {"error": "Servico de moderacao indisponivel."})
            return

        # Verifica decisao da moderacao
        decision = moderation.get("decision", "accepted")

        # Se foi bloqueada, retorna erro 422
        if decision == "blocked":
            logger.warning(
                "message_blocked",
                username=data["username"],
                room=data["room"],
                reason=moderation.get("reason", "blocked_term"),
            )
            json_response(
                self,
                422,
                {"error": "Mensagem bloqueada pela moderacao.", "reason": moderation.get("reason")},
            )
            return

        # Se foi aceita ou moderacao falhou em modo degradado, salva a mensagem
        # Em modo degradado, mensagem fica marcada como "pending_review" na apresentacao
        status = "pending_review" if moderation.get("degraded") else "accepted"
        saved_message = repository.add_message(
            room=data["room"],
            username=data["username"],
            content=moderation.get("sanitizedContent", data["content"]),
            status=status,
            moderation_reason=moderation.get("reason", "accepted"),
            created_at=now_iso(),
        )

        logger.info(
            "message_saved",
            messageId=saved_message["id"],
            room=saved_message["room"],
            status=saved_message["status"],
        )

        json_response(
            self,
            201,
            {
                "message": saved_message,
            },
        )


# Funcao principal que inicia o servidor HTTP
if __name__ == "__main__":
    logger.info("chat_service_started", port=PORT, database=DATABASE_PATH)
    # Cria servidor ThreadingHTTPServer que processa cada requisicao em uma thread separada
    server = ThreadingHTTPServer(("0.0.0.0", PORT), ChatHandler)
    server.serve_forever()
