import os
import secrets
import threading
import logging
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
import crypto
import vault
import drive
from models import UnlockRequest, UnlockResponse, EntryCreate, EntryUpdate, Entry

logger = logging.getLogger("uvicorn.error")

app = FastAPI(title="Password Manager", docs_url=None, redoc_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Electron renderer dev
        "file://",                 # Electron renderer prod (some versions)
        "null",                    # Electron file:// pages send Origin: null
    ],
    allow_origin_regex=r"chrome-extension://.*",
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory session state — cleared on process restart (vault lock)
_session: dict = {"key": None, "token": None, "salt": None}


def _require_auth(authorization: Optional[str] = Header(None)) -> bytes:
    if not _session["token"] or not authorization:
        raise HTTPException(status_code=401, detail="Vault is locked")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not secrets.compare_digest(token, _session["token"]):
        raise HTTPException(status_code=401, detail="Invalid token")
    return _session["key"]


def _sync_to_drive() -> None:
    """Fire-and-forget Drive sync after a write. Runs in a daemon thread."""
    key = _session.get("key")
    salt = _session.get("salt")
    if not key or not salt or not drive.drive_configured():
        return
    def _upload():
        try:
            vault_bytes = vault.export_vault_bytes()
            drive.upload_backup(key, salt, vault_bytes)
            logger.info("Auto-synced vault to Google Drive.")
        except Exception as e:
            logger.warning(f"Drive auto-sync failed (non-fatal): {e}")
    threading.Thread(target=_upload, daemon=True).start()


@app.post("/unlock", response_model=UnlockResponse)
def unlock(req: UnlockRequest):
    # If Drive is configured, try to restore the vault from Drive first.
    # This handles the case where the local vault.db was lost (e.g. WSL reset).
    if drive.drive_configured():
        try:
            key, salt, vault_bytes = drive.restore_from_drive(req.master_password)
            vault.import_vault_bytes(vault_bytes)
            _session["key"] = key
            _session["salt"] = salt
            _session["token"] = secrets.token_hex(32)
            logger.info("Vault restored from Google Drive.")
            return UnlockResponse(token=_session["token"])
        except FileNotFoundError:
            pass  # No backup on Drive yet — fall through to local vault
        except Exception as e:
            # Decryption failed (wrong password) or Drive error.
            # Only fall through if local vault exists; otherwise it's a bad password.
            if not vault.vault_exists():
                raise HTTPException(status_code=403, detail="Wrong master password")
            logger.warning(f"Drive restore failed, falling back to local vault: {e}")

    # Local vault path
    if not vault.vault_exists():
        salt = crypto.new_salt()
        vault.init_vault(salt)
    else:
        salt = vault.get_salt()
    key = crypto.derive_key(req.master_password, salt)
    try:
        vault.list_entries(key)
    except Exception:
        raise HTTPException(status_code=403, detail="Wrong master password")
    _session["key"] = key
    _session["salt"] = salt
    _session["token"] = secrets.token_hex(32)
    return UnlockResponse(token=_session["token"])


@app.post("/lock")
def lock():
    _session["key"] = None
    _session["token"] = None
    _session["salt"] = None
    return {"status": "locked"}


@app.get("/entries", response_model=list[Entry])
def list_entries(key: bytes = Depends(_require_auth)):
    return vault.list_entries(key)


@app.post("/entries", response_model=Entry)
def create_entry(entry: EntryCreate, key: bytes = Depends(_require_auth)):
    data = entry.model_dump()
    entry_id = vault.add_entry(key, data)
    _sync_to_drive()
    return {**data, "id": entry_id}


@app.get("/entries/{entry_id}", response_model=Entry)
def get_entry(entry_id: int, key: bytes = Depends(_require_auth)):
    data = vault.get_entry(key, entry_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    return data


@app.patch("/entries/{entry_id}", response_model=Entry)
def update_entry(entry_id: int, updates: EntryUpdate, key: bytes = Depends(_require_auth)):
    if not vault.update_entry(key, entry_id, updates.model_dump(exclude_none=True)):
        raise HTTPException(status_code=404, detail="Entry not found")
    _sync_to_drive()
    return vault.get_entry(key, entry_id)


@app.delete("/entries/{entry_id}")
def delete_entry(entry_id: int, key: bytes = Depends(_require_auth)):
    if not vault.delete_entry(entry_id):
        raise HTTPException(status_code=404, detail="Entry not found")
    _sync_to_drive()
    return {"status": "deleted"}


@app.post("/backup/upload")
def backup_upload(key: bytes = Depends(_require_auth)):
    salt = _session["salt"]
    vault_bytes = vault.export_vault_bytes()
    file_id = drive.upload_backup(key, salt, vault_bytes)
    return {"file_id": file_id}


@app.post("/backup/download")
def backup_download(key: bytes = Depends(_require_auth)):
    vault_bytes = drive.download_backup(key)
    vault.import_vault_bytes(vault_bytes)
    return {"status": "restored"}
