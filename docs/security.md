# Security

Dieses Dokument enthält Sicherheitsvorgaben für OpenVoice.

---

## 1. Sicherheitsprinzipien

- Browser ist nicht vertrauenswürdig.
- Backend ist Autorität für Auth, Rechte und Daten.
- SFU bekommt nur kurzlebige Tokens.
- coturn bekommt nur kurzlebige Credentials.
- Keine Secrets im Frontend.
- Kein Logging sensibler Daten.
- Keine Medienaufzeichnung ohne explizite Funktion und Zustimmung.

---

## 2. Auth

MVP:

- Email + Passwort.
- Argon2id.
- Session Cookie.
- Secure, HttpOnly, SameSite.
- CSRF-Schutz bei Cookie-Auth.
- Rate Limits für Login und Register.
- Passwort-Reset-Token kurzlebig.

---

## 3. Rechte

- Jeder API-Endpunkt prüft Rechte serverseitig.
- Jeder WebSocket Event Dispatch prüft Sichtbarkeit.
- Voice Tokens werden nur nach Permission Check ausgegeben.
- TURN Credentials werden nur an authentifizierte Nutzer ausgegeben.
- Channel Events dürfen keine privaten Channels leaken.
- Moderationsaktionen prüfen zusätzlich Rollen-Hierarchie und Owner-Schutz.
- Aktive Bans und Timeouts werden serverseitig durchgesetzt.

---

## 4. Web Security

Pflicht:

- CSP. Phase 9 setzt `default-src 'self'`, `object-src 'none'` und `frame-ancestors 'none'`.
- HSTS. Phase 9 aktiviert HSTS ueber `ENABLE_HSTS=true` fuer HTTPS-Deployments.
- X-Content-Type-Options. Phase 9 setzt `nosniff`.
- Referrer-Policy. Phase 9 setzt `no-referrer`.
- Frame-Ancestors restriktiv. Phase 9 setzt zusaetzlich `X-Frame-Options: DENY`.
- CORS restriktiv. Phase 9 erlaubt nur `CORS_ALLOWED_ORIGINS` und Credentials nur fuer diese
  Origins.
- HTML immer escapen/sanitizen.
- Markdown nur als sicheres Subset.

Cookie-authentifizierte unsafe Requests brauchen den CSRF-Token und werden bei vorhandenem
`Origin`/`Referer` gegen dieselbe Origin-Allowlist geprueft.

---

## 5. Media Security

- SFU-Rooms an Workspace/Channel binden.
- Media Join Tokens kurzlebig.
- Tokens enthalten konkrete Publish-Rechte.
- Backend kann Publish-Rechte entziehen.
- Server Mute muss technisch erzwungen werden.
- Screen Capture darf nie ohne Nutzeraktion starten.

---

## 6. coturn Security

- Keine anonymen TURN-Zugänge.
- `use-auth-secret` verwenden.
- REST Credentials zeitlich begrenzen.
- Relay-Port-Range begrenzen und dokumentieren.
- Private Zielnetze blockieren, wo sinnvoll.
- Quotas setzen.
- Prometheus-Metriken überwachen.

---

## 7. Datenschutz

- Audio/Video im MVP nicht speichern.
- Chat persistent speichern.
- Audit-Logs mit Retention.
- IP-Adressen hashen oder kürzen.
- WebRTC Detailstats begrenzt speichern.
- Gelöschte Nutzer pseudonymisieren.

---

## 8. Security Tests

Pflichtfälle:

- Kein Zugriff ohne Auth.
- Kein Zugriff auf fremden Workspace.
- Kein Zugriff auf unsichtbaren Channel.
- Kein Senden ohne `SEND_MESSAGES`.
- Kein Voice Join ohne `CONNECT_VOICE`.
- Kein Audio Publish ohne `SPEAK`.
- Kein Audio Publish während aktivem Timeout.
- Kein 4K Screenshare ohne `SHARE_SCREEN_4K`.
- Keine statischen TURN Secrets im Frontend Bundle.
- Rate Limits greifen.
- CSRF-Schutz greift.

Phase 9 ergaenzt requestweite API-Rate-Limits fuer Auth, TURN Credentials, RTC Stats, Voice Actions
und allgemeine API-Reads/Writes. Chat-spezifische Message-Limits bleiben serverseitig in der
Message-Domaene.
