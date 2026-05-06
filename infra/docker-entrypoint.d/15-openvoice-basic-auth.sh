#!/bin/sh
set -eu

auth_dir=/etc/nginx/auth
auth_file="$auth_dir/openvoice.htpasswd"
site_user="${OPENVOICE_SITE_USER:-openvoice}"
site_password="${OPENVOICE_SITE_PASSWORD:-}"

if [ -z "$site_password" ]; then
  echo "OPENVOICE_SITE_PASSWORD is required for the web container." >&2
  exit 1
fi

mkdir -p "$auth_dir"
htpasswd -Bbc "$auth_file" "$site_user" "$site_password" >/dev/null
chown root:nginx "$auth_file"
chmod 640 "$auth_file"
