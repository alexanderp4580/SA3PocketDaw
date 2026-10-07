#!/usr/bin/env bash
# Creates a 365-day self-signed certificate in certs/ for localhost, 127.0.0.1,
# this host's global IPv4 addresses (ip addr) and its hostname.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p certs
host="$(uname -n)"
san="DNS:localhost,IP:127.0.0.1"
[ -n "$host" ] && san="$san,DNS:$host"
for ip in $(ip -4 -o addr show scope global 2>/dev/null | awk '{split($4,a,"/"); print a[1]}'); do
  case "$ip" in
    *:*) ;; # IPv4 only
    *) san="$san,IP:$ip" ;;
  esac
done
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout certs/key.pem -out certs/cert.pem \
  -subj "/CN=${host:-localhost}" -addext "subjectAltName=$san"
chmod 600 certs/key.pem
echo "certs/cert.pem and certs/key.pem created; SAN: $san"
