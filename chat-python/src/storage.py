# Importacoes para trabalhar com SQLite e type hints
import os
import sqlite3
from typing import Dict, List


# Classe que encapsula o acesso ao banco de dados SQLite
class MessageRepository:
    """Encapsula o acesso ao SQLite para manter a regra de negocio separada da camada de dados."""

    def __init__(self, database_path: str) -> None:
        # Caminho do arquivo do banco de dados
        self.database_path = database_path
        # Cria diretorio se nao existir
        directory = os.path.dirname(database_path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        # Inicializa o banco de dados (cria tabelas se necessario)
        self._initialize()

    # Retorna uma conexao ativa com o banco de dados
    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path, check_same_thread=False)
        # Define row_factory para retornar dicionarios em vez de tuplas
        connection.row_factory = sqlite3.Row
        return connection

    # Cria a tabela de mensagens se ela nao existir
    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    room TEXT NOT NULL,
                    username TEXT NOT NULL,
                    content TEXT NOT NULL,
                    status TEXT NOT NULL,
                    moderation_reason TEXT,
                    created_at TEXT NOT NULL
                )
                """
            )

    # Verifica se a conexao com o banco de dados esta funcionando
    def healthcheck(self) -> bool:
        with self._connect() as connection:
            connection.execute("SELECT 1")
        return True

    # Adiciona uma nova mensagem no banco de dados
    def add_message(
        self,
        room: str,
        username: str,
        content: str,
        status: str,
        moderation_reason: str,
        created_at: str,
    ) -> Dict:
        # Insere a mensagem e obtém o ID autoincrement gerado
        with self._connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO messages (room, username, content, status, moderation_reason, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (room, username, content, status, moderation_reason, created_at),
            )
            message_id = cursor.lastrowid

        # Retorna a mensagem em formato dicionario
        return {
            "id": message_id,
            "room": room,
            "username": username,
            "content": content,
            "status": status,
            "moderationReason": moderation_reason,
            "createdAt": created_at,
        }

    # Lista mensagens de uma sala com paginacao
    def list_messages(self, room: str, limit: int, after_id: int) -> List[Dict]:
        # Busca mensagens em ordem descrescente (mais recentes primeiro)
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, room, username, content, status, moderation_reason, created_at
                FROM messages
                WHERE room = ?
                  AND id > ?
                  AND status IN ('accepted', 'pending_review')
                ORDER BY id DESC
                LIMIT ?
                """,
                (room, after_id, limit),
            ).fetchall()

        # Inverte a ordem para retornar do mais antigo para mais recente
        ordered_rows = list(reversed(rows))
        # Converte cada linha em dicionario
        return [
            {
                "id": row["id"],
                "room": row["room"],
                "username": row["username"],
                "content": row["content"],
                "status": row["status"],
                "moderationReason": row["moderation_reason"],
                "createdAt": row["created_at"],
            }
            for row in ordered_rows
        ]
