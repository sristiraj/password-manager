import io
import json
from pathlib import Path
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload, MediaIoBaseDownload
from crypto import encrypt, decrypt, derive_key
from crypto import ARGON2_SALT_LEN

SCOPES = ["https://www.googleapis.com/auth/drive.file"]
CONFIG_DIR = Path.home() / ".password-manager"
TOKEN_PATH = CONFIG_DIR / "token.json"
CREDENTIALS_PATH = Path(__file__).parent / "credentials.json"
BACKUP_FILENAME = "password-manager-vault-backup.enc"


def drive_configured() -> bool:
    """True only if the user has already completed the OAuth flow (token.json exists)."""
    return CREDENTIALS_PATH.exists() and TOKEN_PATH.exists()


def _get_service():
    creds = None
    if TOKEN_PATH.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDENTIALS_PATH), SCOPES)
            creds = flow.run_local_server(port=0)
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        TOKEN_PATH.write_text(creds.to_json())
    return build("drive", "v3", credentials=creds)


def _find_backup_file_id(service) -> str | None:
    results = service.files().list(
        q=f"name='{BACKUP_FILENAME}' and trashed=false",
        spaces="drive",
        fields="files(id)",
    ).execute()
    files = results.get("files", [])
    return files[0]["id"] if files else None


def upload_backup(key: bytes, salt: bytes, vault_bytes: bytes) -> str:
    """Encrypt vault_bytes, prepend salt, and upload to Drive. Returns file ID.

    Backup format: [16-byte salt][nonce+ciphertext]
    The salt is stored unencrypted so we can re-derive the key from just the
    master password when restoring on a fresh system.
    """
    encrypted = encrypt(key, vault_bytes)
    payload = salt + encrypted
    service = _get_service()
    file_id = _find_backup_file_id(service)
    media = MediaIoBaseUpload(io.BytesIO(payload), mimetype="application/octet-stream")
    if file_id:
        file = service.files().update(fileId=file_id, media_body=media).execute()
    else:
        metadata = {"name": BACKUP_FILENAME}
        file = service.files().create(body=metadata, media_body=media, fields="id").execute()
    return file["id"]


def download_backup(key: bytes) -> bytes:
    """Download and decrypt the Drive backup using the provided key.

    Handles both the new format (salt prefix) and old format (no prefix).
    Returns raw vault SQLite bytes.
    """
    service = _get_service()
    file_id = _find_backup_file_id(service)
    if not file_id:
        raise FileNotFoundError("No backup found in Google Drive")
    buf = io.BytesIO()
    downloader = MediaIoBaseDownload(buf, service.files().get_media(fileId=file_id))
    done = False
    while not done:
        _, done = downloader.next_chunk()
    payload = buf.getvalue()
    # Try new format first (salt prefix): skip the leading 16-byte salt
    try:
        return decrypt(key, payload[ARGON2_SALT_LEN:])
    except Exception:
        pass
    # Fall back to old format (no salt prefix)
    return decrypt(key, payload)


def restore_from_drive(master_password: str) -> tuple[bytes, bytes, bytes]:
    """Download the Drive backup, extract the embedded salt, derive the key,
    and decrypt the vault. Returns (key, salt, vault_bytes).

    Used on unlock when no local vault exists so we can restore from Drive
    without needing any prior local state.
    """
    service = _get_service()
    file_id = _find_backup_file_id(service)
    if not file_id:
        raise FileNotFoundError("No backup found in Google Drive")
    buf = io.BytesIO()
    downloader = MediaIoBaseDownload(buf, service.files().get_media(fileId=file_id))
    done = False
    while not done:
        _, done = downloader.next_chunk()
    payload = buf.getvalue()
    if len(payload) <= ARGON2_SALT_LEN:
        raise ValueError("Backup payload too short — may be in old format")
    salt = payload[:ARGON2_SALT_LEN]
    encrypted = payload[ARGON2_SALT_LEN:]
    key = derive_key(master_password, salt)
    vault_bytes = decrypt(key, encrypted)  # raises InvalidTag if wrong password
    return key, salt, vault_bytes
