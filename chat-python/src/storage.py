import os
import sqlite3
from typing import Dict, List


class MessageRepository:
    """Encapsula o acesso ao SQLite para manter a regra de negocio separada."""

    def __init__(self, database_path: str) -> None:
        self.database_path = database_path
        directory = os.path.dirname(database_path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        return connection

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

    def healthcheck(self) -> bool:
        with self._connect() as connection:
            connection.execute("SELECT 1")
        return True

    def add_message(
        self,
        room: str,
        username: str,
        content: str,
        status: str,
        moderation_reason: str,
        created_at: str,
    ) -> Dict:
        with self._connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO messages (room, username, content, status, moderation_reason, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (room, username, content, status, moderation_reason, created_at),
            )
            message_id = cursor.lastrowid

        return {
            "id": message_id,
            "room": room,
            "username": username,
            "content": content,
            "status": status,
            "moderationReason": moderation_reason,
            "createdAt": created_at,
        }

    def list_messages(self, room: str, limit: int, after_id: int) -> List[Dict]:
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

        ordered_rows = list(reversed(rows))
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
