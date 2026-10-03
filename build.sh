#!/usr/bin/env bash
# Buduje aplikację: zależności backendu (uv) i produkcyjny bundle panelu (Vite -> frontend/dist).
#
# Użycie: ./build.sh [--test]
#   --test   przed buildem uruchamia testy backendu, scenariusze E2E UC-1..UC-5
#            (shared/scenarios) oraz lint i testy frontendu
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_TESTS=false

for arg in "$@"; do
  case "$arg" in
    --test) RUN_TESTS=true ;;
    -h|--help) sed -n '2,6p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Nieznana opcja: $arg" >&2; exit 2 ;;
  esac
done

step() { printf '\n==> %s\n' "$*"; }
die() { echo "BŁĄD: $*" >&2; exit 1; }

# Lokalny Node w .tools/node ma pierwszeństwo przed systemowym (frontend wymaga Node >= 24).
if [[ -x "$ROOT/.tools/node/bin/node" ]]; then
  export PATH="$ROOT/.tools/node/bin:$PATH"
fi

# Testy i build zawsze bez fixture'ów, niezależnie od lokalnego frontend/.env
# (zmienna środowiskowa ma pierwszeństwo przed plikami .env Vite).
export VITE_USE_FIXTURES=false

command -v uv >/dev/null || die "brak 'uv' (https://docs.astral.sh/uv/)"
command -v node >/dev/null || die "brak 'node'"
command -v npm >/dev/null || die "brak 'npm'"

node -e '
  const [maj] = process.versions.node.split(".").map(Number);
  const ok = maj >= 24;
  if (!ok) { console.error("Node " + process.versions.node + " jest za stary, wymagany >=24"); process.exit(1); }
' || die "niewspierana wersja Node"

step "Backend: instalacja zależności"
cd "$ROOT/backend"
if $RUN_TESTS; then
  uv sync --extra dev
else
  uv sync
fi

step "Frontend: instalacja zależności"
cd "$ROOT/frontend"
# HUSKY=0: nie instaluj hooków gita przy buildzie.
HUSKY=0 npm ci --no-audit --no-fund

if $RUN_TESTS; then
  E2E=tests/integration/test_demo_scenarios.py

  step "Backend: testy (bez scenariuszy E2E)"
  cd "$ROOT/backend"
  uv run pytest -q --deselect "$E2E"

  step "Backend: scenariusze E2E UC-1..UC-5 (shared/scenarios)"
  uv run pytest -q "$E2E"

  step "Frontend: lint i testy"
  cd "$ROOT/frontend"
  npm run lint
  npm run test:run
fi

step "Frontend: build (tsc + vite)"
cd "$ROOT/frontend"
npm run build

step "Gotowe"
echo "Panel:  $ROOT/frontend/dist"
echo "Start:  ./run.sh"
