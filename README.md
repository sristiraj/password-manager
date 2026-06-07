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

Follow these steps to generate the `credentials.json` file required for Google Drive integration.

#### 6a. Create a Google Cloud project

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and sign in
2. Click the project dropdown at the top → **New Project**
3. Give it a name (e.g. `password-manager`) and click **Create**

#### 6b. Enable the Google Drive API

1. In the left sidebar go to **APIs & Services → Library**
2. Search for **Google Drive API** and click on it
3. Click **Enable**

#### 6c. Configure the OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen**
2. Select **External** as the user type and click **Create**
3. Fill in the required fields:
   - **App name** — e.g. `Password Manager`
   - **User support email** — your email address
   - **Developer contact email** — your email address
4. Click **Save and Continue** through the remaining steps (Scopes and Test users can be left at defaults)
5. On the **Test users** step, click **Add users** and add your own Google account — this is required while the app is in testing mode
6. Click **Save and Continue**, then **Back to Dashboard**

#### 6d. Create an OAuth 2.0 client credential

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth client ID**
3. Set **Application type** to **Desktop app**
4. Give it a name (e.g. `password-manager-desktop`) and click **Create**
5. Click **Download JSON** on the confirmation dialog (or use the download icon next to the credential later)

#### 6e. Place the file

Save the downloaded file as `backend/credentials.json`:

```bash
# from the project root
mv ~/Downloads/client_secret_*.json backend/credentials.json
```

The first time you use the Google Drive backup feature, a browser window will open for you to authorise access. The resulting OAuth refresh token is saved to `~/.password-manager/token.json` automatically.

> Both `credentials.json` and `token.json` are gitignored and never committed.

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
