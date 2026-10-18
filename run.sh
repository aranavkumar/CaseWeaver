#!/usr/bin/env bash
# CaseWeaver — one-shot dev launcher.
# Starts the FastAPI backend (:8000) and the Next.js frontend (:3000) together.
# Ctrl-C stops both.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
VENV="$BACKEND/.venv"

echo "==> CaseWeaver dev launcher"

# --- Backend ---
if [ ! -d "$VENV" ]; then
  echo "==> Creating Python virtualenv (backend/.venv)"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install --upgrade pip >/dev/null
  "$VENV/bin/pip" install -r "$BACKEND/requirements.txt"
fi

[ -f "$BACKEND/.env" ] || cp "$BACKEND/.env.example" "$BACKEND/.env"

echo "==> Starting backend on http://localhost:8000"
( cd "$BACKEND" && "$VENV/bin/uvicorn" app.main:app --reload --port 8000 ) &
BACK_PID=$!

# --- Frontend ---
if [ ! -d "$FRONTEND/node_modules" ]; then
  echo "==> Installing frontend dependencies"
  ( cd "$FRONTEND" && npm install )
fi

echo "==> Starting frontend on http://localhost:3000"
( cd "$FRONTEND" && npm run dev ) &
FRONT_PID=$!

trap 'echo; echo "==> Shutting down"; kill $BACK_PID $FRONT_PID 2>/dev/null || true' INT TERM
wait
