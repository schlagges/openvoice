# Datenschutz und Retention

OpenVoice speichert im MVP nur Daten, die fuer Auth, Workspace-Betrieb, Chat, Moderation und
Betriebsmessung noetig sind.

## Persistente Daten

| Datenart                              | Speicherort                | Retention                                                  |
| ------------------------------------- | -------------------------- | ---------------------------------------------------------- |
| User und Sessions                     | PostgreSQL                 | Sessions bis Ablauf oder Logout, User bis Loeschung        |
| Workspaces, Members, Rollen, Channels | PostgreSQL                 | Bis Workspace- oder Member-Loeschung                       |
| Chat-Nachrichten                      | PostgreSQL                 | Persistent, Deletes sind Soft Deletes                      |
| Audit-Logs                            | PostgreSQL                 | Empfohlen 180 Tage, laenger nur mit Betreiberentscheidung  |
| Bans und Timeouts                     | PostgreSQL                 | Aktive Eintraege bis Aufhebung/Ablauf, Historie fuer Audit |
| RTC-Quality-Samples                   | Prozessmetriken/Prometheus | Aggregiert, keine Rohdaten in PostgreSQL                   |

## Nicht gespeicherte Daten

- Audio, Kamera-Video und Screenshare werden im MVP nicht aufgezeichnet.
- TURN REST-Credentials werden kurzlebig erzeugt und nicht im Frontend hardcodiert.
- LiveKit Join Tokens sind kurzlebig und enthalten nur die noetigen Rechteclaims.

## Logging

- API-Fehlerlogs enthalten Request-ID, Pfad, Methode, Status und Fehlercode.
- Keine Passwoerter, Session-Tokens, CSRF-Tokens, TURN-Secrets oder LiveKit-Secrets loggen.
- IP-Adressen sollen produktiv gehasht oder gekuerzt werden, sobald persistente Request-Logs
  eingefuehrt werden.

## Loesch- und Pseudonymisierungsregeln

- Geloeschte Nutzer sollen in Chat- und Audit-Historie pseudonymisiert werden.
- Chat Soft Deletes behalten Metadaten fuer Moderation, zeigen aber keinen aktiven Inhalt.
- Audit-Logs duerfen nur so lange aufbewahrt werden, wie der Betreiber es fuer Sicherheit und
  Missbrauchsnachvollzug braucht.
