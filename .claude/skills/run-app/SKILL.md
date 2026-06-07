---
description: Launch the password manager app (WSL backend + Electron UI) via start.sh
---

# run-app skill

Launches the full password-manager stack on Windows + WSL.

## Architecture recap

- **Backend**: FastAPI/uvicorn running in WSL on `127.0.0.1:8765`
- **Frontend**: Electron app running natively on Windows
- **Networking**: WSL2 mirrored networking (`~/.wslconfig` has `networkingMode=mirrored`) so Windows and WSL share `127.0.0.1`

## How to run

### Via start.sh (recommended)

```bash
bash start.sh
```

Run this from WSL in the project root. It:
1. Creates `.venv-linux` inside `backend/` if missing
2. Bootstraps pip via `get-pip.py` if needed
3. Installs `uv` into the venv, then installs all deps
4. Starts `uvicorn` via `.venv-linux/bin/uvicorn` on port 8765
5. Waits for backend to be ready
6. Runs `npm install` (Windows-side via `cmd.exe`) if `node_modules` missing
7. Fixes Electron binary if `path.txt` missing (uses `powershell.exe Expand-Archive`)
8. Launches Electron via `cmd.exe /c "npm run dev"`
9. Kills the backend when Electron exits

### Manual (for testing/screenshots)

Start the backend (keep this PowerShell process alive — do NOT close it):

```powershell
$cmd = "cd /mnt/c/Users/srist/Downloads/password-manager/backend && /mnt/c/Users/srist/Downloads/password-manager/backend/.venv-linux/bin/uvicorn main:app --port 8765"
$backend = Start-Process "wsl" -ArgumentList "bash -c `"$cmd`"" -PassThru -WindowStyle Hidden
```

Then launch Electron:

```powershell
Start-Process -FilePath "C:\Users\srist\Downloads\password-manager\electron\node_modules\electron\dist\electron.exe" -ArgumentList "C:\Users\srist\Downloads\password-manager\electron"
```

### Playwright automation (for screenshots/testing)

Run from `electron/` directory:

```js
const { _electron: electron } = require('playwright');
const app = await electron.launch({ args: ['.'] });
const page = await app.firstWindow();
// interact, screenshot, etc.
await app.close();
```

## How to stop

```powershell
Get-Process -Name "electron" -ErrorAction SilentlyContinue | Stop-Process -Force
wsl bash -c "fuser -k 8765/tcp 2>/dev/null"
Get-Process -Name "wsl" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
```

## Known issues & fixes

### `python3-venv` missing (first run on fresh WSL)
```bash
sudo apt update && sudo apt install python$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')-venv -y
```

### Electron binary missing (`path.txt` not found)
The `extract-zip` npm package hangs on NTFS from WSL. `start.sh` works around this
by using `powershell.exe Expand-Archive` to extract the cached zip and write `path.txt`.
Cached zip lives at `%LOCALAPPDATA%\electron\Cache\`.

### Windows Python on port 8765 returning 500
Electron's `main.js` used to spawn Windows Python (no packages) on port 8765.
Fixed: `main.js` now skips backend spawn entirely in dev mode (`!app.isPackaged`).
If a rogue process appears: `Stop-Process -Id (netstat -ano | findstr ':8765').Split()[-1] -Force`

### WSL backend not reachable from Windows
Requires `networkingMode=mirrored` in `C:\Users\srist\.wslconfig`.
After editing, run `wsl --shutdown` then relaunch WSL.

### `uvicorn` not found / `C:/Program` error
Use `.venv-linux/bin/uvicorn` directly (the script), not `python -m uvicorn`.
The venv `python3` symlink points to system Python on NTFS; the `uvicorn` wrapper
script has the correct shebang and works even when `python -m uvicorn` fails.
