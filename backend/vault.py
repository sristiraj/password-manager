import json
import sqlite3
import os
from pathlib import Path
from typing import Optional
from crypto import encrypt, decrypt, b64enc, b64dec

VAULT_DIR = Path.home() / ".password-manager"
VAULT_PATH = VAULT_DIR / "vault.db"


def _get_conn() -> sqlite3.Connection:
    VAULT_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(VAULT_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_vault(salt: bytes) -> None:
    conn = _get_conn()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            blob TEXT NOT NULL
        )
    """)
    conn.execute("INSERT OR IGNORE INTO meta VALUES ('salt', ?)", (b64enc(salt),))
    conn.commit()
    conn.close()


def get_salt() -> Optional[bytes]:
    if not VAULT_PATH.exists():
        return None
    conn = _get_conn()
    row = conn.execute("SELECT value FROM meta WHERE key='salt'").fetchone()
    conn.close()
    return b64dec(row["value"]) if row else None


def vault_exists() -> bool:
    return VAULT_PATH.exists()


def add_entry(key: bytes, data: dict) -> int:
    plaintext = json.dumps(data).encode()
    blob = b64enc(encrypt(key, plaintext))
    conn = _get_conn()
    cur = conn.execute("INSERT INTO entries (blob) VALUES (?)", (blob,))
    conn.commit()
    entry_id = cur.lastrowid
    conn.close()
    return entry_id


def get_entry(key: bytes, entry_id: int) -> Optional[dict]:
    conn = _get_conn()
    row = conn.execute("SELECT id, blob FROM entries WHERE id=?", (entry_id,)).fetchone()
    conn.close()
    if not row:
        return None
    data = json.loads(decrypt(key, b64dec(row["blob"])))
    data["id"] = row["id"]
    return data


def list_entries(key: bytes) -> list[dict]:
    conn = _get_conn()
    rows = conn.execute("SELECT id, blob FROM entries").fetchall()
    conn.close()
    result = []
    for row in rows:
        data = json.loads(decrypt(key, b64dec(row["blob"])))
        data["id"] = row["id"]
        result.append(data)
    return result


def update_entry(key: bytes, entry_id: int, data: dict) -> bool:
    existing = get_entry(key, entry_id)
    if existing is None:
        return False
    existing.pop("id", None)
    existing.update({k: v for k, v in data.items() if v is not None})
    blob = b64enc(encrypt(key, json.dumps(existing).encode()))
    conn = _get_conn()
    conn.execute("UPDATE entries SET blob=? WHERE id=?", (blob, entry_id))
    conn.commit()
    conn.close()
    return True


def delete_entry(entry_id: int) -> bool:
    conn = _get_conn()
    cur = conn.execute("DELETE FROM entries WHERE id=?", (entry_id,))
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def export_vault_bytes() -> bytes:
    return VAULT_PATH.read_bytes()


def import_vault_bytes(data: bytes) -> None:
    VAULT_DIR.mkdir(parents=True, exist_ok=True)
    VAULT_PATH.write_bytes(data)
