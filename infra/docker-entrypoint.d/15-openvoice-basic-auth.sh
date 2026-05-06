#!/bin/sh
set -eu

auth_dir=/etc/nginx/auth
auth_file="$auth_dir/openvoice.htpasswd"
site_user="${OPENVOICE_SITE_USER:-openvoice}"
site_password="${OPENVOICE_SITE_PASSWORD:-}"
basic_auth_enabled="${OPENVOICE_BASIC_AUTH_ENABLED:-auto}"

if [ "$basic_auth_enabled" = "false" ] || { [ "$basic_auth_enabled" = "auto" ] && [ -z "$site_password" ]; }; then
  sed -i 's/auth_basic "OpenVoice";/auth_basic off;/' /etc/nginx/conf.d/default.conf
  exit 0
fi

if [ "$basic_auth_enabled" != "true" ] && [ "$basic_auth_enabled" != "auto" ]; then
  echo "OPENVOICE_BASIC_AUTH_ENABLED must be true, false, or auto." >&2
  exit 1
fi

if [ -z "$site_password" ]; then
  echo "OPENVOICE_SITE_PASSWORD is required when basic auth is enabled." >&2
  exit 1
fi

mkdir -p "$auth_dir"
htpasswd -Bbc "$auth_file" "$site_user" "$site_password" >/dev/null
chown root:nginx "$auth_file"
chmod 640 "$auth_file"
