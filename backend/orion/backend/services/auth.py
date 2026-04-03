from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets

from dataclasses import dataclass
from datetime import timedelta

from ..config import OrionConfig
from ..db import Database
from ..models import SessionRecord, User
from ..utils.ids import make_id
from ..utils.time import utc_now, utc_now_iso


PBKDF2_ITERATIONS = 240_000
ALLOWED_ROLES = {"student", "lecturer", "admin"}


def _normalize_email(value: str) -> str:
    return value.strip().lower()


def _password_hash(password: str, salt: bytes | None = None) -> str:
    active_salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), active_salt, PBKDF2_ITERATIONS)
    return "pbkdf2_sha256${iterations}${salt}${digest}".format(
        iterations=PBKDF2_ITERATIONS,
        salt=base64.b64encode(active_salt).decode("ascii"),
        digest=base64.b64encode(digest).decode("ascii"),
    )


def _verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations_raw, salt_raw, digest_raw = stored_hash.split("$", 3)
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        base64.b64decode(salt_raw.encode("ascii")),
        int(iterations_raw),
    )
    return hmac.compare_digest(base64.b64encode(digest).decode("ascii"), digest_raw)


def _hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


@dataclass(slots=True)
class AuthSession:
    user: User
    session: SessionRecord

    def to_dict(self) -> dict:
        return {"user": self.user.to_dict(), "session": self.session.to_dict()}


class AuthService:
    def __init__(self, config: OrionConfig, db: Database):
        self.config = config
        self.db = db

    def setup_required(self) -> bool:
        row = self.db.fetchone("SELECT COUNT(*) AS count FROM users")
        return not row or int(row["count"]) == 0

    def user_count(self) -> int:
        row = self.db.fetchone("SELECT COUNT(*) AS count FROM users")
        return int(row["count"]) if row else 0

    def bootstrap_admin(self, full_name: str, email: str, password: str) -> User:
        if not self.setup_required():
            raise ValueError("Bootstrap is only available before the first user exists.")
        return self._create_user(full_name=full_name, email=email, password=password, role="admin")

    def create_user(self, full_name: str, email: str, password: str, role: str) -> User:
        if role not in ALLOWED_ROLES:
            raise ValueError(f"Unsupported role '{role}'.")
        return self._create_user(full_name=full_name, email=email, password=password, role=role)

    def _create_user(self, full_name: str, email: str, password: str, role: str) -> User:
        normalized_email = _normalize_email(email)
        if not normalized_email:
            raise ValueError("Email is required.")
        if len(password) < 8:
            raise ValueError("Password must be at least 8 characters long.")
        if self.db.fetchone("SELECT 1 FROM users WHERE email = ?", (normalized_email,)):
            raise ValueError("A user with that email already exists.")

        now = utc_now_iso()
        user = User(
            id=make_id("user"),
            email=normalized_email,
            full_name=full_name.strip() or normalized_email,
            role=role,
            is_active=True,
            created_at=now,
            updated_at=now,
            last_login_at=None,
        )
        self.db.execute(
            """
            INSERT INTO users (id, email, full_name, password_hash, role, is_active, created_at, updated_at, last_login_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user.id,
                user.email,
                user.full_name,
                _password_hash(password),
                user.role,
                1,
                user.created_at,
                user.updated_at,
                user.last_login_at,
            ),
        )
        return user

    def list_users(self) -> list[dict]:
        rows = self.db.fetchall(
            """
            SELECT users.*, COUNT(sessions.id) AS active_session_count
            FROM users
            LEFT JOIN sessions ON sessions.user_id = users.id AND sessions.expires_at > ?
            GROUP BY users.id
            ORDER BY users.created_at DESC
            """,
            (utc_now_iso(),),
        )
        return [
            {
                **self._row_to_user(row).to_dict(),
                "active_session_count": int(row["active_session_count"]),
            }
            for row in rows
        ]

    def authenticate(self, email: str, password: str) -> User:
        row = self.db.fetchone("SELECT * FROM users WHERE email = ?", (_normalize_email(email),))
        if not row or not row["is_active"]:
            raise ValueError("Invalid email or password.")
        if not _verify_password(password, row["password_hash"]):
            raise ValueError("Invalid email or password.")
        user = self._row_to_user(row)
        now = utc_now_iso()
        self.db.execute("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?", (now, now, user.id))
        user.last_login_at = now
        user.updated_at = now
        return user

    def create_session(self, user: User, user_agent: str | None = None, ip_address: str | None = None) -> tuple[str, SessionRecord]:
        self._purge_expired_sessions()
        raw_token = secrets.token_urlsafe(32)
        now = utc_now()
        session = SessionRecord(
            id=make_id("sess"),
            user_id=user.id,
            user_agent=user_agent,
            ip_address=ip_address,
            created_at=now.isoformat(),
            last_seen_at=now.isoformat(),
            expires_at=(now + timedelta(seconds=self.config.session_ttl_seconds)).isoformat(),
        )
        self.db.execute(
            """
            INSERT INTO sessions (id, user_id, token_hash, user_agent, ip_address, created_at, last_seen_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session.id,
                session.user_id,
                _hash_session_token(raw_token),
                session.user_agent,
                session.ip_address,
                session.created_at,
                session.last_seen_at,
                session.expires_at,
            ),
        )
        return raw_token, session

    def get_auth_session(self, token: str) -> AuthSession:
        self._purge_expired_sessions()
        row = self.db.fetchone(
            """
            SELECT
                sessions.id AS session_id,
                sessions.user_id AS session_user_id,
                sessions.user_agent AS session_user_agent,
                sessions.ip_address AS session_ip_address,
                sessions.created_at AS session_created_at,
                sessions.last_seen_at AS session_last_seen_at,
                sessions.expires_at AS session_expires_at,
                users.*
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.is_active = 1
            """,
            (_hash_session_token(token), utc_now_iso()),
        )
        if not row:
            raise ValueError("Session is invalid or has expired.")

        now = utc_now_iso()
        self.db.execute("UPDATE sessions SET last_seen_at = ? WHERE id = ?", (now, row["session_id"]))
        user = self._row_to_user(row)
        session = SessionRecord(
            id=row["session_id"],
            user_id=row["session_user_id"],
            user_agent=row["session_user_agent"],
            ip_address=row["session_ip_address"],
            created_at=row["session_created_at"],
            last_seen_at=now,
            expires_at=row["session_expires_at"],
        )
        return AuthSession(user=user, session=session)

    def list_sessions(self, user_id: str | None = None) -> list[SessionRecord]:
        self._purge_expired_sessions()
        params: tuple | list
        sql = "SELECT * FROM sessions WHERE expires_at > ?"
        params = [utc_now_iso()]
        if user_id:
            sql += " AND user_id = ?"
            params.append(user_id)
        sql += " ORDER BY created_at DESC"
        rows = self.db.fetchall(sql, tuple(params))
        return [self._row_to_session(row) for row in rows]

    def revoke_session(self, session_id: str, user_id: str | None = None) -> None:
        if user_id:
            row = self.db.fetchone("SELECT 1 FROM sessions WHERE id = ? AND user_id = ?", (session_id, user_id))
        else:
            row = self.db.fetchone("SELECT 1 FROM sessions WHERE id = ?", (session_id,))
        if not row:
            raise ValueError("Session does not exist.")
        self.db.execute("DELETE FROM sessions WHERE id = ?", (session_id,))

    def revoke_token(self, token: str) -> None:
        self.db.execute("DELETE FROM sessions WHERE token_hash = ?", (_hash_session_token(token),))

    def reset_auth_state(self) -> None:
        self.db.execute("DELETE FROM sessions")
        self.db.execute("DELETE FROM users")

    def _purge_expired_sessions(self) -> None:
        self.db.execute("DELETE FROM sessions WHERE expires_at <= ?", (utc_now_iso(),))

    @staticmethod
    def _row_to_user(row) -> User:
        return User(
            id=row["id"],
            email=row["email"],
            full_name=row["full_name"],
            role=row["role"],
            is_active=bool(row["is_active"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            last_login_at=row["last_login_at"],
        )

    @staticmethod
    def _row_to_session(row) -> SessionRecord:
        return SessionRecord(
            id=row["id"],
            user_id=row["user_id"],
            user_agent=row["user_agent"],
            ip_address=row["ip_address"],
            created_at=row["created_at"],
            last_seen_at=row["last_seen_at"],
            expires_at=row["expires_at"],
        )
