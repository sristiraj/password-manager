# Password Manager

A local-first, end-to-end encrypted password manager with a desktop app, browser extension, and optional Google Drive backup. Your master password never leaves your device.

## Features

### Desktop App
- Native desktop application built with Electron
- Unlock vault with a master password — credentials stored in an encrypted local database
- Add, view, edit, and delete password entries with usernames, URLs, and notes
- Auto-lock when the app is closed or idle

### Browser Extension
- Chrome and Edge extension (Manifest V3)
- One-click autofill for saved credentials on matching sites
- Session token kept in memory only — cleared when the vault locks
- Communicates directly with the local backend over loopback (`127.0.0.1`)

### Security
- **AES-256-GCM** encryption for all vault data at rest
- **Argon2id** key derivation from master password — designed to resist brute-force attacks
- Master password is never stored anywhere — only an in-memory derived key
- Backend binds to `127.0.0.1` only; a per-session auth token blocks other local processes
- Google Drive backup encrypts the vault before upload — Google never sees plaintext

### Google Drive Backup
- One-click encrypted backup and restore via Google Drive
- Uses your own Google OAuth2 credentials (never shared with a third party)
- Backup file is indistinguishable ciphertext without the master password

---

## Local Setup

### Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Python | 3.11+ | |
| [uv](https://github.com/astral-sh/uv) | latest | Fast Python package manager |
| Node.js | 18+ | |
| npm | 9+ | Bundled with Node.js |
| Git | any | |

### 1. Clone the repository

```bash
git clone https://github.com/sristiraj/password-manager.git
cd password-manager
```

### 2. Backend setup

```bash
cd backend
uv venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

uv pip install -r requirements.txt
```

Start the backend dev server:

```bash
uvicorn main:app --reload --port 8765
```

### 3. Desktop app setup

```bash
cd electron
npm install
npm run dev   # connects to backend on port 8765
```

### 4. Browser extension setup

```bash
cd extension
npm install
npm run build   # output written to extension/dist/
```

Load the extension in Chrome or Edge:
1. Navigate to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `extension/dist/` directory

### 5. Full-stack one-command start (recommended)

From the project root, run:

```bash
bash start.sh
```

This script handles virtualenv creation, dependency installation, backend startup, and Electron launch automatically.

### 6. Google Drive backup (optional)

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the **Google Drive API**
3. Create an **OAuth 2.0 Desktop** client credential
4. Download the credential JSON and save it to `backend/credentials.json`

The `credentials.json` and the OAuth refresh token (`token.json`) are gitignored and stored in `~/.password-manager/`.

### Running tests

```bash
cd backend
pytest                        # all tests
pytest tests/test_crypto.py   # single file
```

---

## Project Structure

```
password-manager/
├── backend/          # FastAPI server — crypto, vault, Drive backup
├── electron/         # Electron desktop shell
├── extension/        # Chrome/Edge browser extension (Manifest V3)
└── start.sh          # Full-stack dev launcher
```

---

## License

This project is licensed under the [Functional Source License 1.1, MIT Future License](LICENSE).
