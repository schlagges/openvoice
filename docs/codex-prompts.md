# Codex Prompts

Diese Prompts können direkt an Codex gegeben werden.

---

## Start: Phase 0

```text
Lies AGENTS.md, PLANS.md und docs/lastenheft.md.

Setze ausschließlich Phase 0 aus PLANS.md um.

Erstelle die Monorepo-Struktur für OpenVoice mit:
- apps/web
- apps/api
- packages/shared
- infra
- docs
- migrations

Richte TypeScript, pnpm, Linting, Tests und Docker Compose mit PostgreSQL und Redis/Valkey ein.

Implementiere noch keine Produktfeatures außer minimaler Projektstruktur.

Am Ende:
- dokumentiere die Befehle
- stelle sicher, dass pnpm install, pnpm lint, pnpm test und pnpm build sinnvoll funktionieren oder sauber als Platzhalter eingerichtet sind
- erstelle eine kurze Zusammenfassung der Änderungen
```

---

## Phase 1

```text
Lies AGENTS.md, PLANS.md und docs/lastenheft.md.

Setze Phase 1 um:
Auth, User, Sessions, Workspace, Rollen, Permission Engine und Audit-Log-Basis.

Halte dich exakt an das Lastenheft.
Beginne mit Datenmodell, Migrationen und Backend-Tests.
Erstelle keine Voice-, Chat- oder Video-Funktionen in dieser Phase.
```

---

## Phase 2

```text
Lies AGENTS.md, PLANS.md und docs/lastenheft.md.

Setze Phase 2 um:
Channel-Baum mit Kategorien, Text, Voice und Combined Channels sowie Permission Overrides.

Achte besonders auf:
- maximale Tiefe 5
- keine Zyklen
- atomisches Reordering
- keine Auslieferung unsichtbarer Channels
- serverseitige Permission Checks
```

---

## Phase 3

```text
Lies AGENTS.md, PLANS.md und docs/lastenheft.md.

Setze Phase 3 um:
Persistenter Chat in Text- und Combined-Channels.

Achte besonders auf:
- Message Create/Edit/Delete
- Soft Delete
- Cursor Pagination
- WebSocket Events
- Markdown-Subset
- Sanitizing/Escaping
- Rate Limits
```

---

## Phase 5 Voice MVP

```text
Lies AGENTS.md, PLANS.md, docs/lastenheft.md und docs/rtc.md.

Setze Phase 5 um:
Voice MVP über WebRTC/SFU mit LiveKit Provider und coturn TURN Credentials.

Achte besonders auf:
- MediaProvider Interface
- keine statischen TURN-Secrets im Frontend
- kurzlebige TURN Credentials
- Voice Join Permission Check
- Mute/Deafen serverseitig erzwingen
- Audio priorisieren
```

---

## Review Prompt

```text
Prüfe die aktuelle Implementierung gegen AGENTS.md, PLANS.md und docs/lastenheft.md.

Finde:
- fehlende Anforderungen
- Sicherheitsprobleme
- fehlende Permission Checks
- fehlende Tests
- unpassende Dependencies
- Architekturabweichungen

Erstelle anschließend eine priorisierte Fixliste und behebe nur die kritischen Punkte.
```
