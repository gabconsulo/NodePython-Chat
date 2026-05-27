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

repository = MessageRepository(DATABASE_PATH)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def json_response(handler: BaseHTTPRequestHandler, status_code: int, payload: dict) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status_code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def read_json(handler: BaseHTTPRequestHandler) -> dict:
    content_length = int(handler.headers.get("Content-Length", "0"))
    raw_body = handler.rfile.read(content_length)
    if not raw_body:
        return {}
    return json.loads(raw_body.decode("utf-8"))


def validate_message(payload: dict):
    username = (payload.get("username") or "").strip()
    room = (payload.get("room") or "geral").strip()
    content = (payload.get("content") or "").strip()

    if not username:
        return None, "O campo username e obrigatorio."
    if not content:
        return None, "O campo content e obrigatorio."
    if len(username) > 40:
        return None, "O username deve ter no maximo 40 caracteres."
    if len(room) > 40:
        return None, "A sala deve ter no maximo 40 caracteres."
    if len(content) > MAX_MESSAGE_LENGTH:
        return None, f"A mensagem deve ter no maximo {MAX_MESSAGE_LENGTH} caracteres."

    return {
        "username": username,
        "room": room or "geral",
        "content": content,
    }, None


class ChatHandler(BaseHTTPRequestHandler):
    server_version = "DistributedChatPython/2.0"

    def log_message(self, format, *args):
        # Evita logs duplicados do BaseHTTPRequestHandler; usamos o logger estruturado abaixo.
        return

    def do_GET(self):
        parsed_url = urlparse(self.path)

        if parsed_url.path == "/health":
            moderation_reachable = True
            moderation_error = None

            try:
                moderation_reachable = moderation_healthcheck()
            except Exception as error:  # pragma: no cover - caminho defensivo
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

        if parsed_url.path == "/messages":
            params = parse_qs(parsed_url.query)
            room = (params.get("room", ["geral"])[0] or "geral").strip()

            try:
                limit = min(max(int(params.get("limit", ["50"])[0]), 1), 100)
                after_id = max(int(params.get("afterId", ["0"])[0]), 0)
            except ValueError:
                json_response(self, 400, {"error": "Parametros limit e afterId devem ser numericos."})
                return

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

        json_response(self, 404, {"error": "Endpoint nao encontrado."})

    def do_POST(self):
        parsed_url = urlparse(self.path)

        if parsed_url.path != "/messages":
            json_response(self, 404, {"error": "Endpoint nao encontrado."})
            return

        try:
            payload = read_json(self)
        except json.JSONDecodeError:
            json_response(self, 400, {"error": "JSON invalido."})
            return

        data, error_message = validate_message(payload)
        if error_message:
            json_response(self, 400, {"error": error_message})
            return

        try:
            moderation = moderate_message(data)
        except Exception as error:
            logger.error("moderation_unavailable", error=str(error))
            json_response(self, 503, {"error": "Servico de moderacao indisponivel."})
            return

        decision = moderation.get("decision", "accepted")

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

        # Mensagens em modo degradado ficam marcadas para deixar a falha visivel na apresentacao.
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


if __name__ == "__main__":
    logger.info("chat_service_started", port=PORT, database=DATABASE_PATH)
    server = ThreadingHTTPServer(("0.0.0.0", PORT), ChatHandler)
    server.serve_forever()
