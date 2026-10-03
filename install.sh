#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

echo
echo "============================================"
echo "        FACSIMILE INSTALLER"
echo "============================================"
echo

command -v python3 >/dev/null 2>&1 || {
  echo "Python 3.11 or newer is required."
  exit 1
}
command -v node >/dev/null 2>&1 || {
  echo "Node.js 20 or newer is required."
  exit 1
}
command -v npm >/dev/null 2>&1 || {
  echo "npm is required."
  exit 1
}

python3 - <<'PY'
import sys
if sys.version_info < (3, 11):
    raise SystemExit(
        f"Python 3.11+ is required; found "
        f"{sys.version_info.major}.{sys.version_info.minor}"
    )
PY

echo "[1/5] Creating Python virtual environment..."
if [[ ! -d ".venv" ]]; then
  python3 -m venv .venv
fi

PYTHON="$ROOT_DIR/.venv/bin/python"
PIP="$ROOT_DIR/.venv/bin/pip"
FACSIMILE="$ROOT_DIR/.venv/bin/facsimile"

echo "[2/5] Installing Facsimile backend..."
"$PYTHON" -m pip install --upgrade pip
"$PIP" install -e .

echo "[3/5] Installing frontend dependencies..."
cd "$ROOT_DIR/frontend"
if [[ -f "package-lock.json" ]]; then
  npm ci
else
  npm install
fi

echo "[4/5] Building frontend..."
npm run build
cd "$ROOT_DIR"

echo "[5/5] Creating launch helper..."
cat > "$ROOT_DIR/facsimile.sh" <<EOF
#!/usr/bin/env bash
cd "$ROOT_DIR"
exec "$FACSIMILE" "\$@"
EOF
chmod +x "$ROOT_DIR/facsimile.sh"

echo
echo "Installation complete."
echo
echo "Launch Facsimile with:"
echo "  ./facsimile.sh"
echo
echo "The workstation will open at http://127.0.0.1:8765"
