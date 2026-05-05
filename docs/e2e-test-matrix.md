# E2E Testmatrix

Diese Matrix beschreibt die Basis-Flows, die vor produktionsnahen Releases mit Playwright oder
einem gleichwertigen Browser-E2E-Setup laufen sollen.

| Bereich       | Flow                                                | Erwartung                                                        |
| ------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| Auth          | Registrierung, Login, Logout                        | Session-Cookie ist HttpOnly/SameSite, Logout beendet Session     |
| Workspace     | Workspace erstellen                                 | Owner, Default-Rollen und Audit-Log entstehen                    |
| Channels      | Kategorie/Text/Voice/Combined erstellen und reorder | Baum bleibt zyklenfrei, Tiefe max. 5                             |
| Permissions   | Channel ohne `VIEW_CHANNEL`                         | API und UI zeigen Channel nicht                                  |
| Chat          | Nachricht senden, editieren, soft-deleten           | Live-Event und History stimmen                                   |
| Chat Security | User ohne `SEND_MESSAGES`                           | API antwortet 403                                                |
| Gateway       | Zwei Browser im selben Workspace                    | Events und Presence werden live verteilt                         |
| Voice         | Zwei Browser im selben Voice Channel                | Audio Join, Self Mute und Self Deafen funktionieren              |
| Video         | Kamera starten/stoppen                              | Preview und Remote-Kachel funktionieren                          |
| Screenshare   | 1080p und 4K-Profil anfordern                       | 4K nur mit `SHARE_SCREEN_4K`, Degradation dokumentiert           |
| Moderation    | Kick/Ban/Timeout/Voice-Disconnect                   | Rechte, Owner-Schutz und Audit-Logs greifen                      |
| Observability | Compose-Stack mit Prometheus/Grafana                | `/readyz`, `/metrics`, Dashboard und Alerts laden                |
| Hardening     | CORS/CSRF/Rate Limits                               | Untrusted Origin und Rate-Limit-Ueberschreitung werden blockiert |

## Mindest-Browser

- Chromium aktuell.
- Firefox aktuell fuer Chat/Gateway/Voice-Basis.
- Safari aktuell fuer Auth/Chat und, soweit unterstuetzt, Media-Flows.

## Manuelle RTC-Ergaenzungen

Die detaillierten RTC-Pruefungen stehen in:

- `docs/manual-voice-tests.md`
- `docs/manual-video-tests.md`
