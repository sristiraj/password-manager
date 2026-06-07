#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Use platform-specific venv to avoid Windows/WSL conflicts on shared filesystem
case "$(uname -s)" in
  Linux|Darwin) VENV_DIR="$ROOT_DIR/backend/.venv-linux" ;;
  *)            VENV_DIR="$ROOT_DIR/backend/.venv" ;;
esac

# Resolve system python binary
if command -v python3 &>/dev/null; then
  SYS_PYTHON=python3
elif command -v python &>/dev/null; then
  SYS_PYTHON=python
else
  echo "Python not found. Please install Python 3."
  exit 1
fi

echo "Starting backend..."

if [ ! -d "$VENV_DIR" ]; then
  echo "Creating virtualenv at $VENV_DIR..."
  if ! $SYS_PYTHON -m venv "$VENV_DIR"; then
    echo "ERROR: Failed to create venv. On Debian/Ubuntu run:"
    echo "  sudo apt install python$(python3 -c 'import sys; print(f\"{sys.version_info.major}.{sys.version_info.minor}\")')-venv -y"
    exit 1
  fi
fi

# Detect python binary from what actually exists (no source activate — NTFS doesn't create it)
if [ -f "$VENV_DIR/bin/python" ]; then
  PYTHON="$VENV_DIR/bin/python"
elif [ -f "$VENV_DIR/Scripts/python.exe" ]; then
  PYTHON="$VENV_DIR/Scripts/python.exe"
else
  echo "ERROR: Could not find python binary in $VENV_DIR"
  exit 1
fi

# Ensure pip is available (stripped on Debian/Ubuntu by default)
if ! "$PYTHON" -m pip --version &>/dev/null 2>&1; then
  echo "Bootstrapping pip via get-pip.py..."
  curl -sS https://bootstrap.pypa.io/get-pip.py -o /tmp/get-pip.py
  "$PYTHON" /tmp/get-pip.py -q
  rm /tmp/get-pip.py
fi

# Install uv into the venv if not already present
if ! "$PYTHON" -m uv --version &>/dev/null 2>&1; then
  echo "Installing uv into venv..."
  "$PYTHON" -m pip install uv -q
fi

echo "Installing dependencies with uv..."
"$PYTHON" -m uv pip install -r "$ROOT_DIR/backend/requirements.txt" -q

echo "Starting FastAPI backend..."
cd "$ROOT_DIR/backend"
"$VENV_DIR/bin/uvicorn" main:app --port 8765 &
BACKEND_PID=$!
cd "$ROOT_DIR"

# Wait for backend to be ready
echo "Waiting for backend to be ready..."
for i in $(seq 1 20); do
  if curl -s http://127.0.0.1:8765 > /dev/null 2>&1; then
    echo "Backend is up."
    break
  fi
  sleep 0.5
done

# Start Electron — must run via Windows since Electron is a native GUI app
echo "Starting Electron UI..."
cd "$ROOT_DIR/electron"

# Only install if node_modules is missing (avoids re-running electron postinstall which hangs on NTFS from WSL)
if [ ! -d "node_modules" ]; then
  cmd.exe /c "npm install"
fi

# Fix electron binary if path.txt is missing (extract-zip hangs on NTFS; use PowerShell Expand-Archive instead)
if [ ! -f "node_modules/electron/path.txt" ]; then
  echo "Fixing electron binary (NTFS/WSL workaround)..."
  # Read version using Python (node may not be in WSL PATH)
  ELECTRON_VER=$("$PYTHON" -c "import json; d=json.load(open('node_modules/electron/package.json')); print(d['version'])")
  powershell.exe -NoProfile -Command "
    \$cache = \"\$env:LOCALAPPDATA\electron\Cache\"
    \$zip = Get-ChildItem \$cache -Recurse -Filter \"electron-v${ELECTRON_VER}-win32-x64.zip\" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not \$zip) { Write-Error 'Electron zip not cached. Run npm install from Windows cmd inside electron/ first.'; exit 1 }
    \$base = (Get-Item 'node_modules\electron').FullName
    \$dist = \"\$base\dist\"
    Remove-Item -Recurse -Force \$dist -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force \$dist | Out-Null
    Expand-Archive -Path \$zip.FullName -DestinationPath \$dist -Force
    Set-Content -Path \"\$base\path.txt\" -Value 'electron.exe' -NoNewline
    Write-Host 'Electron binary installed.'
  "
fi

cmd.exe /c "npm run dev"

# When Electron exits, kill the backend
kill $BACKEND_PID 2>/dev/null
