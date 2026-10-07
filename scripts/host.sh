#!/usr/bin/env bash
# Builds if needed, makes certs if needed, starts the HTTPS server and prints the LAN URLs.
set -euo pipefail
cd "$(dirname "$0")/.."
HTTPS_PORT="${HTTPS_PORT:-8443}"
export HTTPS_PORT

[ -f dist/index.html ] && [ -f dist/sw.js ] || npm run build
[ -f certs/cert.pem ] && [ -f certs/key.pem ] || bash scripts/make-cert.sh
[ -f models/manifest.json ] || echo "note: models/manifest.json is missing; run npm run models:link && npm run manifest"

echo
echo "Open on this Deck or any device on the same network (accept the certificate warning once):"
echo "  https://localhost:${HTTPS_PORT}/"
for ip in $(ip -4 -o addr show scope global 2>/dev/null | awk '{split($4,a,"/"); print a[1]}'); do
  echo "  https://${ip}:${HTTPS_PORT}/"
done
echo
if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  if firewall-cmd --query-port="${HTTPS_PORT}/tcp" >/dev/null 2>&1; then
    echo "firewalld is running and ${HTTPS_PORT}/tcp is open."
  else
    echo "firewalld is running and ${HTTPS_PORT}/tcp is not open in the default zone. If phones cannot connect, run once:"
    echo "  sudo firewall-cmd --add-port=${HTTPS_PORT}/tcp            # until reboot"
    echo "  sudo firewall-cmd --permanent --add-port=${HTTPS_PORT}/tcp && sudo firewall-cmd --reload   # permanent"
  fi
else
  echo "firewalld is not running (or not readable as this user); no firewall check done."
fi
echo
exec node server/serve.mjs
