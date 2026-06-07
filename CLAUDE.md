# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A local-first password manager with:
- **Python backend** — FastAPI server running on localhost, handles crypto and storage
- **Electron desktop app** — UI shell that talks to the Python backend via HTTP
- **Browser extension** — Chrome/Edge (Manifest V3) that communicates with the backend via the native messaging host or direct localhost HTTP
- **Google Drive backup** — encrypted vault snapshots uploaded/downloaded via Google Drive API

## Development Commands

### Backend (Python)
```bash
cd backend
uv pip install -r requirements.txt          # install deps
uvicorn main:app --reload --port 8765    # start dev server
pytest                                   # run all tests
pytest tests/test_crypto.py             # run single test file
``

### Desktop App (Electron)
```bash
cd electron
npm install
npm run dev      # start Electron in dev mode (connects to backend on :8765)
npm run build    # package the app
```

### Browser Extension
```bash
cd extension
npm install
npm run build    # output goes to extension/dist/
npm run watch    # rebuild on file change
```
Load `extension/dist/` as an unpacked extension in Chrome/Edge (`chrome://extensions` → "Load unpacked").

### Full stack (dev)
```bash
# Terminal 1
cd backend && uvicorn main:app --reload --port 8765

# Terminal 2
cd electron && npm run dev
```

## Startup Instructions

Use `start.sh` from the project root to start the full stack in one command:

```bash
bash start.sh
```

This script:
1. Checks that `uv` is installed (install from https://github.com/astral-sh/uv if missing)
2. Creates a virtualenv at `backend/.venv` using `uv venv` (skipped if it already exists)
3. Installs Python deps into the venv with `uv pip install`
4. Activates the venv (handles both Windows `Scripts/activate` and Unix `bin/activate`)
5. Starts the FastAPI backend on port 8765 in the background
6. Polls `http://127.0.0.1:8765` until the backend is ready (up to 10 seconds)
7. Runs `npm install` and launches the Electron UI in the foreground
8. Kills the backend automatically when Electron exits

## Architecture

### Backend (`backend/`)
FastAPI app. All vault data is stored in a single encrypted SQLite database (`~/.password-manager/vault.db`) using SQLCipher or a Python-level AES-256-GCM layer (`cryptography` library). The master password is never stored — it is stretched with Argon2id into an AES key at unlock time and held in memory only.

Key modules:
- `main.py` — FastAPI app, routes, CORS (allowed origin: Electron's file:// or localhost renderer)
- `crypto.py` — key derivation (Argon2id), encrypt/decrypt helpers (AES-256-GCM)
- `vault.py` — CRUD for entries against the SQLite vault
- `drive.py` — Google Drive OAuth2 flow + encrypted backup upload/download
- `models.py` — Pydantic schemas shared by routes and vault layer

The backend binds only to `127.0.0.1` (never `0.0.0.0`). An auth token (random 32-byte hex, stored in memory) is issued at unlock and required on every subsequent request as a Bearer token — this prevents other local processes from reading the vault.

### Electron App (`electron/`)
Thin shell. The renderer process is a plain HTML/CSS/JS UI that calls the backend REST API. No Node integration in the renderer (`nodeIntegration: false`, `contextIsolation: true`). The main process starts/stops the Python backend as a child process when the app launches/quits.

### Browser Extension (`extension/`)
Manifest V3. The service worker (`background.js`) holds the session auth token in memory. The popup (`popup/`) provides a fill-password UX. Communication with the backend is direct `fetch()` to `http://127.0.0.1:8765` — the backend's CORS allowlist includes the extension's `chrome-extension://` origin.

No sensitive data is stored in `chrome.storage` — the extension only caches the session token (valid only while the vault is unlocked).

### Google Drive Backup (`backend/drive.py`)
Uses OAuth2 with a desktop app credential (client ID stored in `backend/credentials.json`, gitignored). The vault is encrypted **before** upload using the same AES-256-GCM key derived from the master password — Google never sees plaintext. Backup file is named `password-manager-vault-backup.enc` in the user's Drive root.

## Key Design Constraints

- Master password is **never persisted** anywhere (not disk, not Drive, not extension storage).
- The session auth token is regenerated on every vault unlock.
- Backend only listens on loopback (`127.0.0.1`).
- `credentials.json` and `token.json` (OAuth refresh token) are gitignored; they live in `~/.password-manager/`.

## Environment & Config

Runtime config lives in `~/.password-manager/config.json`. The backend reads this on startup. No `.env` file is used — sensitive paths are resolved from the user home directory at runtime.

`backend/credentials.json` — Google OAuth2 desktop client secret (must be obtained from Google Cloud Console, placed here for local dev only, never committed).
