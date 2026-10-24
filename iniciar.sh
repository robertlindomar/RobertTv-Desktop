#!/usr/bin/env bash
set -euo pipefail
ROBERTTV_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROBERTTV_ROOT"
exec env -u ELECTRON_RUN_AS_NODE "$ROBERTTV_ROOT/.browser/ecs/electron" "$ROBERTTV_ROOT" "$@"
