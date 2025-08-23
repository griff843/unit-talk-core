#!/usr/bin/env bash
set -Eeuo pipefail

# ===== Config =====
TEMPORAL_PORT="${TEMPORAL_PORT:-7233}"
TEMPORAL_UI_PORT="${TEMPORAL_UI_PORT:-8080}"
DC="docker compose"   # override with: DC="docker-compose" ./dev.sh
ACTION="${1:-up}"     # up | down | logs | phase:a | phase:b | phase:c

has_cmd() { command -v "$1" >/dev/null 2>&1; }

wait_tcp() {
  local host="$1" port="$2" name="${3:-$host:$port}"
  echo "Waiting for $name ..."
  for i in {1..60}; do
    (echo >"/dev/tcp/$host/$port") >/dev/null 2>&1 && { echo "$name is up"; return 0; }
    sleep 1
  done
  echo "Timeout waiting for $name"; return 1
}

wait_http() {
  local url="$1" name="${2:-$url}"
  if ! has_cmd curl; then echo "curl not found, skipping HTTP wait for $name"; return 0; fi
  echo "Waiting for $name ..."
  for i in {1..60}; do
    if curl -fsS "$url" >/dev/null; then echo "$name is up"; return 0; fi
    sleep 1
  done
  echo "Timeout waiting for $name"; return 1
}

have_service() {
  $DC config --services 2>/dev/null | grep -qx "$1"
}

phase_cmd() {
  case "$1" in
    phase:a) $DC run --rm ops npm run ops:phase:a ;;
    phase:b) $DC run --rm ops npm run ops:phase:b ;;
    phase:c) $DC run --rm ops npm run ops:phase:c ;;
    *) echo "Unknown phase '$1'"; exit 2 ;;
  esac
}

case "$ACTION" in
  up)
    echo "Bringing up Temporal stack..."
    $DC up -d temporal-postgres temporal temporal-ui

    wait_tcp 127.0.0.1 "$TEMPORAL_PORT" "Temporal (gRPC :$TEMPORAL_PORT)"
    wait_http "http://127.0.0.1:${TEMPORAL_UI_PORT}" "Temporal UI (:${TEMPORAL_UI_PORT})"

    if have_service worker; then
      echo "Starting worker via Docker..."
      $DC up -d worker
    else
      echo "Starting worker locally (fallback)..."
      # Uses local Node env; ensure deps are installed
      (npm run -w apps/worker worker:dev &) >/dev/null 2>&1 || true
    fi

    echo
    echo "Logs (Ctrl+C to stop viewing; services keep running):"
    if have_service worker; then
      $DC logs -f temporal temporal-ui worker
    else
      $DC logs -f temporal temporal-ui
    fi
    ;;

  down)
    echo "Stopping stack..."
    $DC down -v
    ;;

  logs)
    if have_service worker; then
      $DC logs -f temporal temporal-ui worker
    else
      $DC logs -f temporal temporal-ui
    fi
    ;;

  phase:a|phase:b|phase:c)
    if ! have_service ops; then
      echo "'ops' service not found in docker-compose.yml. Add it to run ops phases."
      exit 1
    fi
    phase_cmd "$ACTION"
    ;;

  *)
    echo "Usage: $0 [up|down|logs|phase:a|phase:b|phase:c]"
    exit 2
    ;;
esac

echo
echo "Done. Useful commands:"
echo "  ./dev.sh logs                # tail Temporal & worker logs"
echo "  ./dev.sh phase:a             # Shadow canary (no promotions)"
echo "  ./dev.sh phase:b             # Controlled promotions (muted)"
echo "  ./dev.sh phase:c             # Full E2E (muted comms)"
