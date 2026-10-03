#!/usr/bin/env bash
# Uruchamia backend (FastAPI + mock GitHuba z danymi demo) i panel (Vite dev server).
#
# Użycie: ./run.sh [--reset] [--fixtures]
#   --reset      po starcie przywraca dane demo i zegar (POST /api/v1/demo/reset)
#   --fixtures   panel czyta statyczne fixture'y (frontend/src/api/fixtures) zamiast backendu
#
# Panel: http://localhost:5173   API: http://localhost:8000/docs   Ctrl+C zatrzymuje oba procesy.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PORT=8000
FRONTEND_PORT=5173
API="http://localhost:$BACKEND_PORT"
USE_FIXTURES=false
RESET=false

for arg in "$@"; do
  case "$arg" in
    --reset) RESET=true ;;
    --fixtures) USE_FIXTURES=true ;;
    -h|--help) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Nieznana opcja: $arg" >&2; exit 2 ;;
  esac
done

step() { printf '\n==> %s\n' "$*"; }
die() { echo "BŁĄD: $*" >&2; exit 1; }

# Lokalny Node w .tools/node ma pierwszeństwo przed systemowym (Vite 8 wymaga Node >= 20.19).
if [[ -x "$ROOT/.tools/node/bin/node" ]]; then
  export PATH="$ROOT/.tools/node/bin:$PATH"
fi

command -v uv >/dev/null || die "brak 'uv' (https://docs.astral.sh/uv/)"
command -v npm >/dev/null || die "brak 'npm'"
command -v curl >/dev/null || die "brak 'curl'"

port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
port_busy "$BACKEND_PORT" && die "port $BACKEND_PORT jest zajęty (działa już inny backend?)"
port_busy "$FRONTEND_PORT" && die "port $FRONTEND_PORT jest zajęty (działa już inny Vite?)"

# Zależności dociągamy tylko, gdy ich brakuje; pełną instalację robi ./build.sh.
if [[ ! -d "$ROOT/backend/.venv" ]]; then
  step "Backend: instalacja zależności"
  (cd "$ROOT/backend" && uv sync)
fi
if [[ ! -d "$ROOT/frontend/node_modules" ]]; then
  step "Frontend: instalacja zależności"
  (cd "$ROOT/frontend" && HUSKY=0 npm ci --no-audit --no-fund)
fi

BACKEND_PID=""
cleanup() {
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

step "Backend: start na $API"
(cd "$ROOT/backend" && exec uv run uvicorn app.main:app --port "$BACKEND_PORT") &
BACKEND_PID=$!

# Pierwszy start robi migracje i seed demo, więc czekamy na /health.
for _ in $(seq 1 60); do
  curl -sf "$API/health" >/dev/null && break
  kill -0 "$BACKEND_PID" 2>/dev/null || die "backend nie wystartował (log powyżej)"
  sleep 0.5
done
curl -sf "$API/health" >/dev/null || die "backend nie odpowiada na /health"

if $RESET; then
  step "Reset danych demo"
  curl -sf -X POST "$API/api/v1/demo/reset" && echo
fi

step "Panel: start na http://localhost:$FRONTEND_PORT (fixtures: $USE_FIXTURES)"
echo "    Swagger:        $API/docs"
echo "    Mock GitHuba:   $API/api/v3/orgs/longtails/repos"
echo "    Scenariusze:    shared/scenarios/ (UC-1..UC-5)"
# Zmienna środowiskowa ma pierwszeństwo przed frontend/.env, więc nie trzeba go edytować.
cd "$ROOT/frontend"
VITE_USE_FIXTURES="$USE_FIXTURES" npx vite --port "$FRONTEND_PORT" --strictPort
