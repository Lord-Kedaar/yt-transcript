#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
cat >&2 <<EOF
ytTranscript Vite frontend server is disabled.

Use the single-port workflow:
  cd ${DIR}
  npm run build
  ./manage.sh restart
  open http://localhost:4000

Reason: port 3000 caused stale Vite vs Express :4000 divergence.
EOF
exit 1
