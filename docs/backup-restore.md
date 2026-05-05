# Backup und Restore

Diese Anleitung beschreibt den Mindeststandard fuer self-hosted OpenVoice-Installationen.

## Backup-Ziele

- PostgreSQL ist die persistente Quelle fuer User, Workspaces, Rollen, Channels, Chat, Moderation
  und Audit-Logs.
- Valkey/Redis enthaelt nur PubSub-, Presence- und temporaere Gateway-Zustaende und wird nicht
  gesichert.
- LiveKit und coturn speichern im MVP keine Medieninhalte.

## PostgreSQL Backup

Empfohlener taeglicher Dump:

```bash
docker compose --env-file .env.example -f infra/docker-compose.yml exec -T postgres \
  pg_dump --format=custom --no-owner --no-acl --username="$POSTGRES_USER" "$POSTGRES_DB" \
  > openvoice-$(date +%F).dump
```

Produktive Backups muessen ausserhalb des Compose-Hosts gespeichert und verschluesselt werden.
Die konkrete Verschluesselung haengt von der Zielumgebung ab; das Passwort oder der KMS-Zugriff
darf nicht im Repository liegen.

## Restore-Test

Restore in eine leere Datenbank:

```bash
docker compose --env-file .env.example -f infra/docker-compose.yml exec -T postgres \
  createdb --username="$POSTGRES_USER" openvoice_restore_test

docker compose --env-file .env.example -f infra/docker-compose.yml exec -T postgres \
  pg_restore --dbname=openvoice_restore_test --username="$POSTGRES_USER" --clean --if-exists \
  < openvoice-YYYY-MM-DD.dump
```

Nach dem Restore:

1. API mit der Restore-Datenbank starten.
2. `GET /readyz` pruefen.
3. Login, Workspace-Liste, Channel-Tree, Message-History und Audit-Log stichprobenartig pruefen.
4. Restore-Test-Datenbank wieder entfernen.

## Retention

- Mindestens 7 taegliche Backups.
- Mindestens 4 woechentliche Backups.
- Mindestens 3 monatliche Backups fuer produktive Instanzen.

Kuerzere Retention ist nur akzeptabel, wenn Betreiber sie bewusst im eigenen Betriebshandbuch
dokumentieren.
