# OpenVoice RTC QA Interactive Playbook

**Dateiname im Repo:** `docs/qa/rtc-codex-interactive-playbook.md`  
**Zweck:** Dieses Dokument führt Codex und Tester Schritt für Schritt durch die manuelle RTC-/Voice-/Video-/TURN-/4K-QA für OpenVoice v0.1.0-rc1.

---

## 0. Arbeitsmodus

Dieses Playbook ist für einen interaktiven Ablauf gedacht:

```text
Codex nennt genau einen Use Case.
Tester führt ihn manuell aus.
Tester meldet Ergebnis zurück.
Codex dokumentiert Ergebnis, klassifiziert Fehler und nennt den nächsten Use Case.
```

Codex soll **nicht** alle Tests auf einmal abfragen. Immer nur **ein Testfall pro Runde**.

---

## 1. Dateien, die Codex benutzen soll

Codex soll vor dem Start lesen:

```text
AGENTS.md
PLANS.md
docs/lastenheft.md
docs/rtc.md
docs/permissions.md
docs/security.md
docs/deployment.md
docs/testing.md
docs/observability.md
docs/qa/rtc-codex-interactive-playbook.md
```

Codex soll Ergebnisse fortlaufend schreiben nach:

```text
docs/qa/rtc-test-results-v0.1.0-rc1.md
```

Falls die Datei nicht existiert, soll Codex sie anlegen.

Optional für Bugs:

```text
docs/qa/rtc-bug-backlog-v0.1.0-rc1.md
```

---

## 2. Verhalten von Codex während der manuellen QA

### 2.1 Codex soll pro Runde so antworten

Codex soll immer dieses Format nutzen:

```md
## Nächster Test: <TEST-ID> — <Titel>

### Ziel
<kurz erklären, was geprüft wird>

### Voraussetzung
<Accounts, Browser, Channel, Geräte, Netzwerk>

### Schritte
1. ...
2. ...
3. ...

### Erwartetes Ergebnis
- ...
- ...

### Bitte melde zurück
Kopiere diese Vorlage und fülle sie aus:

TEST-ID:
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
ARTIFACTS:
NOTES:
```

### 2.2 Codex soll nach Nutzer-Rückmeldung so handeln

Wenn der Tester antwortet, soll Codex:

1. Ergebnis in `docs/qa/rtc-test-results-v0.1.0-rc1.md` eintragen.
2. Bei `PASS`: nächsten Testfall nennen.
3. Bei `FAIL`: Fehler einstufen als P0/P1/P2.
4. Bei `BLOCKED`: Blocker dokumentieren und sinnvollen nächsten Schritt vorschlagen.
5. Bei `SKIPPED`: Grund dokumentieren.
6. Bei P0: stoppen und empfehlen, erst zu fixen, bevor weitere RTC-Tests folgen.
7. Bei P1: weiter testen nur, wenn der Fehler nicht Folgetests verfälscht.
8. Bei P2: dokumentieren und fortfahren.

### 2.3 Codex darf während QA nicht

- keine neuen Features vorschlagen,
- keinen Code ändern, solange nicht ausdrücklich „Fixe P0/P1“ gesagt wurde,
- keine großen Refactors vorschlagen,
- keine Annahme als bestanden markieren,
- keine Tests überspringen, ohne den Grund zu dokumentieren,
- keine Secrets in Ergebnisdateien schreiben.

---

## 3. Ergebnisformat

Codex soll `docs/qa/rtc-test-results-v0.1.0-rc1.md` so aufbauen:

```md
# RTC Test Results v0.1.0-rc1

## Environment

- Date:
- Commit SHA:
- Staging URL:
- SFU URL:
- TURN Host:
- Tester:
- Notes:

## Summary

| Status | Count |
|---|---:|
| PASS | 0 |
| FAIL | 0 |
| BLOCKED | 0 |
| SKIPPED | 0 |

## Findings

| Priority | Count |
|---|---:|
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |

## Test Results

<!-- Codex appends one section per test. -->
```

Jeder Testeintrag:

```md
### <TEST-ID>: <Titel>

- Status: PASS / FAIL / BLOCKED / SKIPPED
- Priority if failed: P0 / P1 / P2 / n/a
- Date:
- Commit SHA:
- Tester:
- Browser/OS:
- Users:
- Channel:
- Actual result:
- Metrics:
- Artifacts:
- Notes:
- Next action:
```

---

## 4. Bug-Klassifikation

### P0 — Release blockiert

P0 ist alles, was Sicherheit, Rechte, Voice-Kernfunktion oder Stabilität grundsätzlich bricht.

Beispiele:

- Voice Join funktioniert nicht.
- Audio kommt nicht an.
- User ohne `CONNECT_VOICE` bekommt SFU-Token.
- User ohne `SPEAK` kann senden.
- Private Voice States leaken.
- Server Mute kann umgangen werden.
- TURN Credentials enthalten statische Secrets.
- SFU, API oder Gateway crasht.
- WebSocket sendet private Events an falsche Nutzer.
- App startet Kamera oder Screenshare ohne Nutzeraktion.

### P1 — Closed Beta blockiert

P1 ist alles, was Beta-Nutzung stark gefährdet.

Beispiele:

- Reconnect funktioniert unzuverlässig.
- TURN TCP/TLS-Fallback defekt.
- Screenshare stoppt nicht sauber.
- 4K wird falsch angezeigt.
- Audio wird bei Videoüberlast nicht priorisiert.
- Qualitätsanzeige fehlt oder ist falsch.
- Audit Logs bei Voice-Moderation fehlen.
- UI zeigt falsche Voice-Zustände.

### P2 — nach v0.1.0 verschiebbar

P2 ist störend, aber nicht releasekritisch.

Beispiele:

- UI unschön.
- Safari-Einschränkung ist dokumentiert.
- 4K nur auf manchen Geräten stabil.
- Music Mode noch nicht perfekt.
- Diagnoseanzeige könnte schöner sein.

---

## 5. Testumgebung vorbereiten

### 5.1 Staging-Umgebung

Die Tests sollen auf einer echten Staging-Umgebung laufen, nicht nur auf localhost.

Beispiel:

```text
https://staging.voice.example.com
wss://staging.voice.example.com/api/v1/gateway
wss://sfu.staging.voice.example.com
turn.staging.voice.example.com
```

### 5.2 Vor jedem Testlauf prüfen

```bash
pnpm lint
pnpm test
pnpm build
```

Health Checks, wenn verfügbar:

```bash
curl -i https://staging.voice.example.com/api/v1/health
curl -i https://staging.voice.example.com/api/v1/turn/credentials
```

Der TURN-Credentials-Endpoint darf keine statischen Secrets oder langfristigen Passwörter ausgeben.

### 5.3 Testaccounts

| Account | Rolle | Zweck |
|---|---|---|
| `owner@test.local` | Owner | darf alles |
| `mod@test.local` | Moderator | Server mute/deafen/move |
| `user-a@test.local` | Member | normaler Sprecher |
| `user-b@test.local` | Member | normaler Sprecher |
| `nospeak@test.local` | Member ohne `SPEAK` | darf joinen, aber nicht sprechen |
| `novoice@test.local` | Member ohne `CONNECT_VOICE` | darf nicht joinen |
| `no4k@test.local` | Member ohne `SHARE_SCREEN_4K` | darf Screen teilen, aber kein 4K |

### 5.4 Testchannels

Workspace:

```text
OpenVoice QA
```

Channel-Struktur:

```text
QA/
  voice-baseline
  voice-5-users
  voice-20-users
  voice-low-latency
  voice-music-mode
  video-camera
  screen-1080p
  screen-4k
  turn-forced
  private-voice-no-access
```

Rechte:

| Channel | Besonderheit |
|---|---|
| `voice-baseline` | normale Member dürfen joinen und sprechen |
| `private-voice-no-access` | `novoice` darf nicht sehen/joinen |
| `screen-4k` | nur User mit `SHARE_SCREEN_4K` darf 4K-Profil |
| `turn-forced` | für TURN-only Tests |
| `voice-20-users` | Userlimit testweise 25 |

### 5.5 Geräte

Minimum:

| Gerät | Zweck |
|---|---|
| Laptop A | User A |
| Laptop B | User B |
| Laptop C | Moderator |
| Desktop mit 4K-Monitor | 4K-Screenshare |
| Smartphone oder zweites Netzwerk | Netzwechseltest |

Alle Tester sollen Kopfhörer nutzen, damit Echo nicht mit App-Fehlern verwechselt wird.

### 5.6 Debug-Tools

Bei Chrome, Chromium und Edge:

```text
chrome://webrtc-internals
```

Bei Firefox:

```text
about:webrtc
```

Diese Seiten vor dem Call öffnen, damit Stats und Verbindungsdaten während des Tests gesammelt werden.

---

## 6. Metriken, die gesammelt werden sollen

Bei jedem RTC-Test nach Möglichkeit dokumentieren:

```text
Join Time
ICE State
Candidate Type: host / srflx / relay
Transport: udp / tcp / tls
Audio RTT
Audio Jitter
Audio Packet Loss
Audio Bitrate
Audio Codec
Video Resolution
Video FPS
Video Bitrate
Video Codec
SFU Participants
SFU CPU/RAM, falls sichtbar
TURN Allocations, falls sichtbar
Gateway Disconnects, falls sichtbar
```

---

## 7. Harte Bestehensgrenzen

| Bereich | Bestanden, wenn |
|---|---|
| Voice Join | unter 2 Sekunden im Normalfall |
| Audio | keine Aussetzer länger als 1 Sekunde |
| Audio Packet Loss normal | unter 2–3 % |
| Audio Jitter normal | unter 30 ms |
| Audio RTT gleiche Region | ideal unter 150 ms |
| Mute lokal | unter 50 ms spürbar |
| Mute remote sichtbar | unter 250 ms |
| Reconnect | unter 5 Sekunden nach Netzrückkehr |
| 1080p Screenshare | lesbar, stabil, keine Audio-Probleme |
| 4K Screenshare | 3840×2160 wird erreicht oder sauber degradiert |
| TURN UDP | Verbindung über `relay` funktioniert |
| TURN TCP/TLS | Verbindung funktioniert trotz höherer Latenz |
| UDP blockiert | App fällt sauber auf TURN TCP/TLS zurück |
| Rechtefehler | kein Token, kein Join, keine privaten Events |

---

# 8. Testfälle

Codex soll die Testfälle in der folgenden Reihenfolge einzeln durchführen.

---

## RTC-PRE-001 — Staging Preflight

### Ziel

Prüfen, ob die Staging-Umgebung grundsätzlich bereit für manuelle RTC-Tests ist.

### Voraussetzung

- Staging ist deployed.
- Tester hat Zugriff auf Repository und Staging.
- Testaccounts sind angelegt oder können angelegt werden.

### Schritte

1. Prüfe, ob Web-App lädt.
2. Prüfe API Health Endpoint.
3. Prüfe, ob Login mit `owner@test.local` funktioniert.
4. Prüfe, ob Workspace `OpenVoice QA` existiert.
5. Prüfe, ob Testchannels existieren.
6. Prüfe, ob SFU erreichbar ist.
7. Prüfe, ob TURN-Credentials-Endpoint antwortet.
8. Prüfe, dass keine TURN-Secrets im Browser angezeigt werden.

### Erwartetes Ergebnis

- Web-App lädt.
- API ist healthy.
- Login funktioniert.
- Workspace und Testchannels existieren.
- SFU ist erreichbar.
- TURN Credentials sind kurzlebig.
- Keine Secrets im Frontend.

### Bitte zurückmelden

```text
TEST-ID: RTC-PRE-001
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
ARTIFACTS:
NOTES:
```

---

## RTC-AUD-001 — 2 Nutzer Audio Baseline

### Ziel

Prüfen, ob zwei Nutzer demselben Voice-Channel beitreten und sich gegenseitig hören können.

### Voraussetzung

- User A: `user-a@test.local`
- User B: `user-b@test.local`
- Channel: `voice-baseline`
- Browser A: Chrome/Chromium empfohlen
- Browser B: Chrome/Firefox empfohlen
- Beide nutzen Kopfhörer.
- `chrome://webrtc-internals` oder `about:webrtc` ist geöffnet.

### Schritte

1. User A öffnet Staging und loggt sich ein.
2. User B öffnet Staging und loggt sich ein.
3. User A joint `voice-baseline`.
4. User B joint `voice-baseline`.
5. User A spricht 30 Sekunden.
6. User B spricht 30 Sekunden.
7. Beide sprechen abwechselnd.
8. Beide schweigen 10 Sekunden.
9. Beide verlassen den Channel.

### Erwartetes Ergebnis

- Beide hören sich.
- Speaking Indicator stimmt grob.
- Keine langen Aussetzer.
- Kein Echo.
- Kein Roboterklang.
- ICE State bleibt `connected` oder `completed`.
- App zeigt sinnvolle Qualitätswerte.

### Fehler-Priorität

- Fail = P0, wenn Audio gar nicht funktioniert.
- Fail = P1, wenn Audio funktioniert, aber instabil ist.

### Bitte zurückmelden

```text
TEST-ID: RTC-AUD-001
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
  Join Time A:
  Join Time B:
  ICE State:
  Candidate Type:
  Transport:
  Audio RTT:
  Audio Jitter:
  Audio Packet Loss:
  Audio Bitrate:
  Codec:
ARTIFACTS:
NOTES:
```

---

## RTC-AUD-002 — Self Mute

### Ziel

Prüfen, ob ein Nutzer sich selbst stummschalten kann und andere ihn dann nicht mehr hören.

### Voraussetzung

- User A und User B sind in `voice-baseline`.
- Audio aus `RTC-AUD-001` funktioniert.

### Schritte

1. User A spricht.
2. User B bestätigt, dass A hörbar ist.
3. User A klickt Mute.
4. User A spricht weiter.
5. User B prüft, ob A nicht mehr hörbar ist.
6. User A klickt Unmute.
7. User A spricht wieder.
8. User B prüft, ob A wieder hörbar ist.

### Erwartetes Ergebnis

- Mute wirkt lokal sofort.
- Andere hören User A nach Mute nicht mehr.
- UI zeigt User A als muted.
- Unmute funktioniert.
- Voice State wird korrekt synchronisiert.

### Fehler-Priorität

- Fail = P0, wenn Mute gar nicht wirkt.
- Fail = P1, wenn UI-State falsch ist, Audio aber korrekt stoppt.

### Bitte zurückmelden

```text
TEST-ID: RTC-AUD-002
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
  Mute local reaction time:
  Mute remote visible time:
ARTIFACTS:
NOTES:
```

---

## RTC-AUD-003 — Self Deafen

### Ziel

Prüfen, ob Deafen dazu führt, dass der Nutzer niemanden hört und selbst nicht sendet.

### Voraussetzung

- User A und User B sind in `voice-baseline`.

### Schritte

1. User B spricht.
2. User A bestätigt, dass B hörbar ist.
3. User A klickt Deafen.
4. User B spricht weiter.
5. User A prüft, ob B nicht mehr hörbar ist.
6. User A spricht.
7. User B prüft, ob A nicht hörbar ist.
8. User A klickt Undeafen.
9. Beide prüfen, ob Audio wieder normal funktioniert.

### Erwartetes Ergebnis

- User A hört niemanden mehr.
- User A sendet selbst nicht mehr.
- UI zeigt Deafened.
- Rückkehr funktioniert ohne Rejoin.

### Fehler-Priorität

- Fail = P0, wenn Deafen Audio nicht stoppt.
- Fail = P1, wenn nur UI-State falsch ist.

### Bitte zurückmelden

```text
TEST-ID: RTC-AUD-003
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
ARTIFACTS:
NOTES:
```

---

## RTC-MOD-001 — Server Mute

### Ziel

Prüfen, ob ein Moderator einen Nutzer serverseitig muten kann und der Nutzer diesen Zustand nicht umgehen kann.

### Voraussetzung

- Moderator: `mod@test.local`
- User A: `user-a@test.local`
- Channel: `voice-baseline`
- Moderator hat `MUTE_MEMBERS`.

### Schritte

1. User A joint `voice-baseline`.
2. Moderator öffnet denselben Channel oder das Voice-Panel.
3. User A spricht.
4. Moderator aktiviert Server Mute für User A.
5. User A versucht weiterzusprechen.
6. User A versucht lokal Unmute.
7. User B oder Moderator prüft, ob A hörbar ist.
8. Moderator entfernt Server Mute.
9. User A spricht wieder.
10. Prüfe Audit Log.

### Erwartetes Ergebnis

- User A kann trotz lokalem Unmute nicht senden.
- Backend/SFU erzwingt Server Mute.
- Andere hören User A nicht.
- UI zeigt Server Mute.
- Audit Log enthält Aktion.
- Nach Entfernen des Server Mutes kann A wieder sprechen.

### Fehler-Priorität

- Fail = P0, wenn Server Mute umgangen werden kann.
- Fail = P1, wenn Audit Log fehlt, Audio aber korrekt blockiert.

### Bitte zurückmelden

```text
TEST-ID: RTC-MOD-001
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
ARTIFACTS:
NOTES:
```

---

## RTC-MOD-002 — Server Deafen

### Ziel

Prüfen, ob ein Moderator einen Nutzer serverseitig deafenen kann.

### Voraussetzung

- Moderator: `mod@test.local`
- User A: `user-a@test.local`
- User B: `user-b@test.local`
- Channel: `voice-baseline`
- Moderator hat `DEAFEN_MEMBERS`.

### Schritte

1. User A und User B joinen `voice-baseline`.
2. User B spricht, User A hört zu.
3. Moderator aktiviert Server Deafen für User A.
4. User B spricht weiter.
5. User A prüft, ob B nicht mehr hörbar ist.
6. User A versucht zu sprechen.
7. User B prüft, ob A nicht hörbar ist.
8. User A refreshed die Seite.
9. Prüfe, ob Server Deafen weiter korrekt erzwungen wird oder korrekt neu geladen wird.
10. Moderator entfernt Server Deafen.
11. Prüfe Audit Log.

### Erwartetes Ergebnis

- User A hört niemanden.
- User A sendet nicht.
- Zustand ist im UI erkennbar.
- Refresh erzeugt keinen falschen Zustand.
- Audit Log enthält Aktion.

### Fehler-Priorität

- Fail = P0, wenn Server Deafen umgangen werden kann.
- Fail = P1, wenn Audit Log/UI fehlerhaft ist.

### Bitte zurückmelden

```text
TEST-ID: RTC-MOD-002
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
ARTIFACTS:
NOTES:
```

---

## RTC-PERM-001 — Kein CONNECT_VOICE

### Ziel

Prüfen, dass ein Nutzer ohne `CONNECT_VOICE` keinen Voice-Channel joinen kann und kein SFU-Token erhält.

### Voraussetzung

- User: `novoice@test.local`
- Channel: `voice-baseline` oder `private-voice-no-access`
- User hat kein `CONNECT_VOICE` für den Zielchannel.

### Schritte

1. Login als `novoice@test.local`.
2. Öffne Workspace `OpenVoice QA`.
3. Prüfe, ob der Channel sichtbar ist.
4. Falls sichtbar: versuche zu joinen.
5. Prüfe Network/API Response.
6. Prüfe, ob SFU-Token erzeugt wurde.
7. Prüfe, ob Voice State angelegt wurde.

### Erwartetes Ergebnis

- Channel ist entweder unsichtbar oder Join ist deaktiviert.
- API gibt 403 bei Join-Versuch.
- Kein SFU-Token wird erzeugt.
- Kein unnötiges TURN Credential wird erzeugt.
- Kein Voice State wird angelegt.
- Keine privaten Voice Events werden sichtbar.

### Fehler-Priorität

- Fail = P0.

### Bitte zurückmelden

```text
TEST-ID: RTC-PERM-001
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
  API Status:
  Token issued: yes/no
  Voice state created: yes/no
ARTIFACTS:
NOTES:
```

---

## RTC-PERM-002 — Kein SPEAK

### Ziel

Prüfen, dass ein Nutzer ohne `SPEAK` zwar joinen darf, aber kein Audio publishen kann.

### Voraussetzung

- User: `nospeak@test.local`
- Channel: `voice-baseline`
- User hat `CONNECT_VOICE`, aber kein `SPEAK`.

### Schritte

1. Login als `nospeak@test.local`.
2. Join `voice-baseline`.
3. Versuche zu sprechen.
4. Prüfe, ob andere Nutzer Audio hören.
5. Prüfe UI-Hinweis.
6. Prüfe Token Claims oder API Response, soweit sichtbar/logbar.

### Erwartetes Ergebnis

- Join ist möglich.
- Audio Publish ist nicht möglich.
- Andere hören nichts.
- UI erklärt fehlendes Sprechrecht.
- Token enthält kein `publishAudio` oder gleichwertiges Claim.

### Fehler-Priorität

- Fail = P0, wenn Audio gesendet wird.
- Fail = P1, wenn nur UI-Hinweis fehlt.

### Bitte zurückmelden

```text
TEST-ID: RTC-PERM-002
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
  Token publishAudio claim if visible:
ARTIFACTS:
NOTES:
```

---

## RTC-PERM-003 — Kein SHARE_SCREEN_4K

### Ziel

Prüfen, dass ein Nutzer ohne `SHARE_SCREEN_4K` kein 4K-Screenshare-Profil nutzen kann.

### Voraussetzung

- User: `no4k@test.local`
- Channel: `screen-4k`
- User hat `SHARE_SCREEN`, aber kein `SHARE_SCREEN_4K`.

### Schritte

1. Login als `no4k@test.local`.
2. Join `screen-4k`.
3. Starte Screenshare.
4. Versuche 4K-Profil auszuwählen.
5. Prüfe API/Token/Client-State.
6. Prüfe, ob normaler Screenshare erlaubt ist.

### Erwartetes Ergebnis

- Normaler Screenshare funktioniert, falls `SHARE_SCREEN` vorhanden ist.
- 4K-Profil ist gesperrt oder wird serverseitig abgelehnt.
- Kein 4K-Publish-Claim wird ausgegeben.
- UI behauptet nicht fälschlich 4K.

### Fehler-Priorität

- Fail = P0, wenn fehlende Rechte 4K Publish erlauben.
- Fail = P1, wenn UI falsch ist, Server aber korrekt blockiert.

### Bitte zurückmelden

```text
TEST-ID: RTC-PERM-003
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
ARTIFACTS:
NOTES:
```

---

## RTC-AUD-005 — 5 Nutzer Audio

### Ziel

Prüfen, ob ein kleiner Gruppen-Voice-Channel stabil funktioniert.

### Voraussetzung

- 5 Browser-Sessions.
- Mindestens 3 physische Geräte, wenn möglich.
- Channel: `voice-5-users`.
- Alle nutzen Kopfhörer.

### Schritte

1. Alle 5 Nutzer joinen nacheinander.
2. Nach jedem Join prüfen, ob Teilnehmerliste stimmt.
3. Jeder Nutzer sagt einmal seinen Namen.
4. Zwei Nutzer sprechen gleichzeitig.
5. Drei Nutzer sprechen kurz nacheinander.
6. Ein Nutzer muted sich selbst.
7. Ein Nutzer verlässt den Channel.
8. Ein Nutzer refreshed die Seite und joined wieder.

### Erwartetes Ergebnis

- Alle hören alle.
- Speaking Indicator stimmt grob.
- Join/Leave Events stimmen.
- Kein Nutzer blockiert den Channel.
- Audio bleibt verständlich.
- UI bleibt bedienbar.

### Fehler-Priorität

- Fail = P0, wenn Gruppen-Audio grundsätzlich nicht funktioniert.
- Fail = P1, wenn es instabil, aber nutzbar ist.

### Bitte zurückmelden

```text
TEST-ID: RTC-AUD-005
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
  Max RTT:
  Max Jitter:
  Max Packet Loss:
  SFU Participants:
  SFU CPU/RAM:
  TURN Relay Ratio:
ARTIFACTS:
NOTES:
```

---

## RTC-AUD-020 — 20 Nutzer Audio

### Ziel

Release-Test für größeren Voice-Channel.

### Voraussetzung

- 20 Sessions.
- So viele echte Geräte wie möglich.
- Channel: `voice-20-users`.
- Test nur ausführen, wenn 2- und 5-Nutzer-Tests bestanden sind.

### Schritte

1. 20 Nutzer joinen in Gruppen von 5.
2. Nach jeder Gruppe 30 Sekunden warten.
3. Jeder Nutzer sagt einmal etwas.
4. 5 Nutzer sprechen schnell nacheinander.
5. 3 Nutzer verlassen den Channel.
6. 3 Nutzer joinen wieder.
7. Moderator muted einen Nutzer.
8. Moderator moved einen Nutzer, falls Move-Funktion vorhanden ist.
9. Beobachte SFU/API/Gateway-Metriken.

### Erwartetes Ergebnis

- SFU bleibt stabil.
- API bleibt stabil.
- Gateway bleibt stabil.
- Kein Memory-/CPU-Ausreißer.
- Audio bleibt nutzbar.
- UI bleibt bedienbar.

### Abbruchkriterien

- SFU crasht.
- API crasht.
- Mehr als 20 % der Nutzer verlieren Audio.
- Join funktioniert nicht mehr.
- Moderation greift nicht.

### Fehler-Priorität

- Fail = P0, wenn System crasht.
- Fail = P1, wenn Performance schlecht, aber System stabil ist.

### Bitte zurückmelden

```text
TEST-ID: RTC-AUD-020
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
  Active Participants:
  Max RTT:
  Max Jitter:
  Max Packet Loss:
  SFU CPU/RAM:
  API CPU/RAM:
  Gateway Disconnects:
ARTIFACTS:
NOTES:
```

---

## RTC-REC-001 — Browser Refresh während Voice

### Ziel

Prüfen, dass Refresh keine Zombie-Teilnehmer oder kaputte Voice States erzeugt.

### Voraussetzung

- User A und User B sind in `voice-baseline`.

### Schritte

1. User A und User B joinen Voice.
2. User A refreshed die Seite.
3. User B beobachtet Teilnehmerliste.
4. User A wartet auf automatischen Reconnect oder joined erneut.
5. User B spricht währenddessen weiter.
6. Prüfe, ob User A sauber zurückkommt.

### Erwartetes Ergebnis

- User A kommt sauber zurück.
- Kein doppelter Teilnehmer.
- Kein Zombie Voice State.
- User B sieht korrekte Join/Leave/Update Events.

### Fehler-Priorität

- Fail = P1.
- Fail = P0, wenn danach Voice generell kaputt bleibt.

### Bitte zurückmelden

```text
TEST-ID: RTC-REC-001
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
  Reconnect time:
  Duplicate participant: yes/no
ARTIFACTS:
NOTES:
```

---

## RTC-REC-002 — Netzwerk kurz weg

### Ziel

Prüfen, ob ein kurzer Netzwerkausfall sauber erkannt und behoben wird.

### Voraussetzung

- User A und User B sind in `voice-baseline`.
- User A kann WLAN/LAN kurz trennen.

### Schritte

1. User A und User B joinen Voice.
2. User A deaktiviert Netzwerk für ca. 5 Sekunden.
3. User A aktiviert Netzwerk wieder.
4. Beobachte UI-Status.
5. Prüfe, ob Audio zurückkommt.
6. Prüfe Teilnehmerliste.

### Erwartetes Ergebnis

- App zeigt Reconnecting oder ähnlichen Status.
- Reconnect unter 5 Sekunden nach Netzrückkehr.
- Kein doppelter Teilnehmer.
- Audio kommt zurück.

### Fehler-Priorität

- Fail = P1.
- Fail = P0, wenn Session dauerhaft kaputt bleibt oder Backend/SFU crasht.

### Bitte zurückmelden

```text
TEST-ID: RTC-REC-002
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
  Network outage duration:
  Reconnect time after network return:
  ICE state after return:
ARTIFACTS:
NOTES:
```

---

## RTC-REC-003 — Netzwechsel

### Ziel

Prüfen, ob ein Nutzer nach Wechsel auf ein anderes Netzwerk wieder verbunden wird.

### Voraussetzung

- User A ist im Voice.
- Zweites Netzwerk ist verfügbar, z. B. mobiler Hotspot.

### Schritte

1. User A verbindet sich per WLAN.
2. User A joined Voice.
3. User A wechselt auf mobilen Hotspot oder anderes WLAN.
4. Beobachte UI-Status.
5. Prüfe, ob Audio zurückkommt.
6. Prüfe, ob ICE Restart oder Reconnect sauber läuft.

### Erwartetes Ergebnis

- Verbindung wird sauber wiederhergestellt.
- Audio kommt zurück.
- Keine doppelten Voice States.

### Fehler-Priorität

- Fail = P1.

### Bitte zurückmelden

```text
TEST-ID: RTC-REC-003
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
  Reconnect time:
  Candidate Type before:
  Candidate Type after:
ARTIFACTS:
NOTES:
```

---

## RTC-CAM-001 — Kamera 720p

### Ziel

Prüfen, ob Kamera-Video in Standardqualität funktioniert.

### Voraussetzung

- User A und User B sind in `video-camera`.
- User A hat Kamera.
- User A hat `STREAM_CAMERA`.

### Schritte

1. User A und User B joinen `video-camera`.
2. User A aktiviert Kamera.
3. User A sieht lokale Preview.
4. User B sieht remote Video.
5. User A deaktiviert Kamera.
6. User B sieht, dass Kamera weg ist.
7. User A aktiviert Kamera erneut.

### Erwartetes Ergebnis

- Kamera startet nur nach Nutzeraktion.
- Preview funktioniert.
- Remote Video funktioniert.
- Stop entfernt Track sauber.
- Audio fällt nicht aus.

### Fehler-Priorität

- Fail = P1.
- Fail = P0, wenn Kamera ohne Nutzeraktion startet oder Audio/Voice dadurch bricht.

### Bitte zurückmelden

```text
TEST-ID: RTC-CAM-001
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
  Resolution:
  FPS:
  Video Bitrate:
  Codec:
  Packet Loss:
ARTIFACTS:
NOTES:
```

---

## RTC-CAM-002 — Kamera 1080p

### Ziel

Prüfen, ob 1080p-Kamera-Profil funktioniert oder sauber degradiert.

### Voraussetzung

- Kamera unterstützt 1080p.
- User A und User B sind in `video-camera`.

### Schritte

1. User A wählt Kamera-Profil 1080p.
2. User A aktiviert Kamera.
3. User B öffnet Video groß.
4. 2 Minuten laufen lassen.
5. Prüfe Stats.
6. User A deaktiviert Kamera.

### Erwartetes Ergebnis

- 1080p wird erreicht oder sauber degradiert.
- UI zeigt tatsächliche Qualität.
- Audio bleibt stabil.

### Fehler-Priorität

- Fail = P1, wenn Profil kaputt ist.
- Fail = P2, wenn nur bestimmte Geräte nicht 1080p liefern und das korrekt angezeigt wird.

### Bitte zurückmelden

```text
TEST-ID: RTC-CAM-002
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
  Actual Resolution:
  FPS:
  Bitrate:
  Codec:
ARTIFACTS:
NOTES:
```

---

## RTC-SCR-001 — 1080p Screenshare

### Ziel

Prüfen, ob Screenshare bei 1080p funktioniert, lesbar ist und sauber stoppt.

### Voraussetzung

- User A und User B sind in `screen-1080p`.
- User A hat `SHARE_SCREEN`.
- User A öffnet eine Seite mit Text, Code oder Tabellen.

### Schritte

1. User A startet Screenshare.
2. User A wählt Fenster, Tab oder Monitor im Browserdialog.
3. User B öffnet den Stream groß.
4. User A scrollt langsam.
5. User A bewegt Maus.
6. User A wechselt Fensterinhalt.
7. User A stoppt Screenshare über App.
8. User A startet Screenshare erneut.
9. User A stoppt über Browser-eigenen Stop-Button.

### Erwartetes Ergebnis

- Browser-Auswahldialog erscheint.
- App startet nicht heimlich Screen Capture.
- Text ist lesbar.
- Stop funktioniert über App und Browser.
- Audio bleibt stabil.
- Keine dauerhaft schwarzen Frames.

### Fehler-Priorität

- Fail = P0, wenn Screenshare heimlich oder ohne Dialog startet.
- Fail = P1, wenn Stop/Qualität/Audio nicht sauber ist.

### Bitte zurückmelden

```text
TEST-ID: RTC-SCR-001
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
  Resolution:
  FPS:
  Bitrate:
  Codec:
  Audio packet loss during share:
ARTIFACTS:
NOTES:
```

---

## RTC-SCR-002 — Screenshare mit Tab-/System-Audio

### Ziel

Prüfen, ob Tab-/System-Audio beim Screenshare funktioniert, falls Browser und OS es anbieten.

### Voraussetzung

- Browser/OS bietet Tab- oder System-Audio beim Screenshare an.
- User A und User B sind in `screen-1080p`.

### Schritte

1. User A startet Screenshare.
2. User A wählt Browser-Tab oder Quelle mit Audio.
3. User A aktiviert im Browserdialog Audio-Sharing, falls verfügbar.
4. User A spielt Testaudio ab.
5. User B prüft, ob Audio hörbar ist.
6. User A stoppt Screenshare.

### Erwartetes Ergebnis

- Audio wird nur gesendet, wenn Nutzer es ausgewählt hat.
- Mikrofon-Audio wird nicht versehentlich ersetzt.
- Stop beendet auch Tab-/System-Audio.
- UI zeigt korrekt, dass Screen-Audio aktiv ist, falls unterstützt.

### Fehler-Priorität

- Fail = P1, wenn Audio kaputt ist.
- Fail = P0, wenn Audio ohne Nutzerwahl gesendet wird.
- SKIPPED ist erlaubt, wenn Browser/OS Audio-Sharing nicht anbietet.

### Bitte zurückmelden

```text
TEST-ID: RTC-SCR-002
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
ARTIFACTS:
NOTES:
```

---

## RTC-4K-001 — 4K Screenshare Profil

### Ziel

Prüfen, ob 4K-Screenshare angefordert, erreicht oder sauber degradiert wird.

### Voraussetzung

- User A hat 4K-Monitor mit 3840×2160.
- User A hat `SHARE_SCREEN_4K`.
- User B schaut Focus View.
- Channel: `screen-4k`.

### Schritte

1. User A stellt sicher, dass der Monitor wirklich 3840×2160 ausgibt.
2. User A öffnet eine 4K-Testseite, großes Codefenster oder Text-/Tabellenfenster.
3. User A joined `screen-4k`.
4. User A wählt Screenshare-Profil 4K.
5. User A teilt den kompletten 4K-Bildschirm.
6. User B öffnet Focus View.
7. Stream 2 Minuten laufen lassen.
8. User A scrollt langsam.
9. User A öffnet Fenster mit kleinem Text.
10. User A stoppt Share.
11. Prüfe WebRTC Stats.

### Erwartetes Ergebnis

- App fordert 3840×2160 an.
- Wenn möglich: Stats zeigen 3840×2160 oder sehr nah dran.
- Wenn nicht möglich: App degradiert sauber auf 1440p/1080p.
- UI zeigt tatsächliche Auflösung.
- Audio bleibt stabil.
- Kein Crash.

### Fehler-Priorität

- Fail = P0, wenn Rechte ignoriert werden oder App crasht.
- Fail = P1, wenn App 4K behauptet, aber ohne Hinweis deutlich niedriger sendet.
- Fail = P2, wenn 4K wegen Hardware/Browser nicht geht, aber sauber dokumentiert/degradiert.

### Bitte zurückmelden

```text
TEST-ID: RTC-4K-001
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
  Requested Resolution:
  Actual Resolution:
  FPS:
  Bitrate:
  Codec:
  Audio Packet Loss:
  CPU/GPU observations:
ARTIFACTS:
NOTES:
```

---

## RTC-TURN-001 — TURN UDP Forced Relay

### Ziel

Prüfen, ob Verbindung über TURN Relay mit UDP funktioniert.

### Voraussetzung

- Debug-Schalter oder Testkonfiguration zum Erzwingen von Relay ist verfügbar.
- Beispiel: Query Parameter `?rtcPolicy=relay` oder Env `RTC_FORCE_RELAY=true`.
- Channel: `turn-forced`.

### Schritte

1. Aktiviere Forced Relay.
2. User A und User B öffnen Staging neu.
3. Beide joinen `turn-forced`.
4. Beide sprechen.
5. Prüfe WebRTC Stats.
6. Prüfe TURN-Metriken/Logs, falls verfügbar.

### Erwartetes Ergebnis

- Candidate Type ist `relay`.
- Transport ist `udp`.
- Audio funktioniert.
- TURN Allocation ist sichtbar.

### Fehler-Priorität

- Fail = P1, wenn TURN UDP nicht funktioniert.
- Fail = P0, wenn normales Voice dadurch kaputt geht oder Credentials unsicher sind.

### Bitte zurückmelden

```text
TEST-ID: RTC-TURN-001
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
  Candidate Type:
  Transport:
  TURN Allocation visible:
  Audio RTT:
  Audio Jitter:
  Packet Loss:
ARTIFACTS:
NOTES:
```

---

## RTC-TURN-002 — UDP blockiert, Fallback auf TURN TCP/TLS

### Ziel

Prüfen, ob Voice trotz blockiertem UDP über TURN TCP oder TURNS funktioniert.

### Voraussetzung

- Testmaschine, auf der ausgehendes UDP blockiert werden darf.
- Kein produktiver Arbeitsplatz ohne Erlaubnis.
- Channel: `turn-forced` oder `voice-baseline`.

### Linux-Beispiel zum UDP-Blocken

Interface finden:

```bash
ip route get 1.1.1.1
```

UDP ausgehend blockieren:

```bash
sudo iptables -I OUTPUT -p udp -j DROP
```

Regel nach Test entfernen:

```bash
sudo iptables -D OUTPUT -p udp -j DROP
```

### Schritte

1. UDP auf Testmaschine blockieren.
2. Browser neu starten.
3. Staging öffnen.
4. User A joined Voice.
5. User B joined Voice von normalem Netzwerk oder ebenfalls Testnetz.
6. Beide sprechen.
7. Prüfe Candidate Type und Transport.
8. Entferne UDP-Block.

### Erwartetes Ergebnis

- Voice funktioniert trotz UDP-Block.
- Candidate Type ist `relay`.
- Transport ist `tcp` oder `tls`.
- Latenz darf höher sein.
- App zeigt schlechtere Qualität, crasht aber nicht.

### Fehler-Priorität

- Fail = P1.
- Fail = P0, wenn App crasht oder sich nicht mehr erholt.

### Bitte zurückmelden

```text
TEST-ID: RTC-TURN-002
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
  Candidate Type:
  Transport:
  Audio RTT:
  Audio Jitter:
  Packet Loss:
ARTIFACTS:
NOTES:
```

---

## RTC-NET-001 — 50 ms Delay + 1 % Loss

### Ziel

Prüfen, ob Audio bei leichter Netzverschlechterung stabil bleibt.

### Voraussetzung

- Linux-Testmaschine oder anderes Network-Emulation-Tool.
- User A und User B in Voice.

### Linux-Beispiel

Interface finden:

```bash
ip route get 1.1.1.1
```

Netzwerkverschlechterung aktivieren:

```bash
sudo tc qdisc add dev <INTERFACE> root netem delay 50ms loss 1%
```

Cleanup:

```bash
sudo tc qdisc del dev <INTERFACE> root
```

### Schritte

1. User A und User B joinen Voice.
2. Aktiviere 50 ms Delay und 1 % Loss auf User A.
3. Beide sprechen 2 Minuten.
4. Starte optional 1080p Screenshare.
5. Prüfe, ob Audio stabil bleibt.
6. Entferne Netem-Regel.

### Erwartetes Ergebnis

- Audio bleibt verständlich.
- Video darf leicht degradieren.
- Qualitätsanzeige zeigt ggf. Warnung.
- Kein Disconnect.

### Fehler-Priorität

- Fail = P1, wenn Audio stark leidet.
- Fail = P2, wenn nur Qualitätsanzeige fehlt.

### Bitte zurückmelden

```text
TEST-ID: RTC-NET-001
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
  Audio RTT:
  Jitter:
  Packet Loss:
  Reconnect occurred: yes/no
ARTIFACTS:
NOTES:
```

---

## RTC-NET-002 — 100 ms Delay + 3 % Loss

### Ziel

Prüfen, ob Audio bei mittlerer Netzverschlechterung noch nutzbar bleibt und Video degradiert.

### Voraussetzung

- `RTC-NET-001` ist bestanden oder zumindest nicht P0.

### Linux-Beispiel

```bash
sudo tc qdisc add dev <INTERFACE> root netem delay 100ms loss 3%
```

Cleanup:

```bash
sudo tc qdisc del dev <INTERFACE> root
```

### Schritte

1. User A und User B joinen Voice.
2. Aktiviere 100 ms Delay und 3 % Loss.
3. Beide sprechen 2 Minuten.
4. Starte 1080p Screenshare.
5. Prüfe Audio, Video, Qualitätsanzeige.
6. Entferne Netem-Regel.

### Erwartetes Ergebnis

- Audio ist noch nutzbar.
- Video/Screenshare degradiert.
- Kein Crash.
- Reconnect nur bei echter Instabilität.

### Fehler-Priorität

- Fail = P1.

### Bitte zurückmelden

```text
TEST-ID: RTC-NET-002
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
  Audio RTT:
  Jitter:
  Packet Loss:
  Video Resolution after degradation:
  Reconnect occurred: yes/no
ARTIFACTS:
NOTES:
```

---

## RTC-NET-003 — 200 ms Delay + 5 % Loss

### Ziel

Prüfen, ob App und Voice bei starker Netzverschlechterung bedienbar bleiben.

### Voraussetzung

- Testmaschine mit Network-Emulation.

### Linux-Beispiel

```bash
sudo tc qdisc add dev <INTERFACE> root netem delay 200ms loss 5%
```

Cleanup:

```bash
sudo tc qdisc del dev <INTERFACE> root
```

### Schritte

1. User A und User B joinen Voice.
2. Aktiviere 200 ms Delay und 5 % Loss.
3. Beide sprechen 2 Minuten.
4. Optional Screenshare starten.
5. Beobachte Audio, UI, Reconnect, Qualitätsanzeige.
6. Entferne Netem-Regel.

### Erwartetes Ergebnis

- App bleibt bedienbar.
- Audio kann schlechter sein, soll aber nicht komplett ausfallen.
- Video muss stark degradieren oder pausieren.
- Qualitätsindikator zeigt schlechten Zustand.

### Fehler-Priorität

- Fail = P1, wenn App/Voice unbrauchbar wird.
- Fail = P2, wenn nur Anzeige schlecht ist.

### Bitte zurückmelden

```text
TEST-ID: RTC-NET-003
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
  Audio RTT:
  Jitter:
  Packet Loss:
  Video State:
  Reconnect occurred: yes/no
ARTIFACTS:
NOTES:
```

---

## RTC-BRW-001 — Browser Matrix: Chrome

### Ziel

Prüfen, dass Kernfunktionen in Chrome/Chromium funktionieren.

### Voraussetzung

- Chrome/Chromium aktuelle stabile Version.

### Schritte

1. Wiederhole `RTC-AUD-001`.
2. Wiederhole `RTC-AUD-002`.
3. Wiederhole `RTC-MOD-001`.
4. Wiederhole `RTC-CAM-001`.
5. Wiederhole `RTC-SCR-001`.
6. Wiederhole `RTC-REC-001`.

### Erwartetes Ergebnis

- Alle Kernfunktionen funktionieren.
- WebRTC Stats sind auswertbar.

### Fehler-Priorität

- Je nach betroffener Kernfunktion P0/P1.

### Bitte zurückmelden

```text
TEST-ID: RTC-BRW-001
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
ARTIFACTS:
NOTES:
```

---

## RTC-BRW-002 — Browser Matrix: Firefox

### Ziel

Prüfen, dass Kernfunktionen in Firefox funktionieren.

### Voraussetzung

- Firefox aktuelle stabile Version.
- `about:webrtc` geöffnet.

### Schritte

1. Wiederhole `RTC-AUD-001`.
2. Wiederhole `RTC-AUD-002`.
3. Wiederhole `RTC-MOD-001`.
4. Wiederhole `RTC-CAM-001`.
5. Wiederhole `RTC-SCR-001`.
6. Wiederhole `RTC-REC-001`.

### Erwartetes Ergebnis

- Kernfunktionen funktionieren.
- Browser-spezifische Einschränkungen werden dokumentiert.

### Fehler-Priorität

- Je nach betroffener Kernfunktion P0/P1/P2.

### Bitte zurückmelden

```text
TEST-ID: RTC-BRW-002
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
ARTIFACTS:
NOTES:
```

---

## RTC-BRW-003 — Browser Matrix: Edge

### Ziel

Prüfen, dass Kernfunktionen in Edge funktionieren.

### Voraussetzung

- Edge aktuelle stabile Version.

### Schritte

1. Wiederhole `RTC-AUD-001`.
2. Wiederhole `RTC-AUD-002`.
3. Wiederhole `RTC-CAM-001`.
4. Wiederhole `RTC-SCR-001`.
5. Wiederhole `RTC-REC-001`.

### Erwartetes Ergebnis

- Kernfunktionen funktionieren.

### Fehler-Priorität

- Je nach betroffener Kernfunktion P0/P1/P2.

### Bitte zurückmelden

```text
TEST-ID: RTC-BRW-003
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
ARTIFACTS:
NOTES:
```

---

## RTC-BRW-004 — Browser Matrix: Safari

### Ziel

Prüfen, welche Kernfunktionen in Safari funktionieren und welche Einschränkungen dokumentiert werden müssen.

### Voraussetzung

- Safari aktuelle stabile Version auf macOS, wenn verfügbar.

### Schritte

1. Wiederhole `RTC-AUD-001`.
2. Wiederhole `RTC-AUD-002`.
3. Wiederhole `RTC-CAM-001`.
4. Wiederhole `RTC-SCR-001`, soweit Safari es unterstützt.
5. Wiederhole `RTC-REC-001`.

### Erwartetes Ergebnis

- Audio funktioniert.
- Kamera funktioniert.
- Screenshare funktioniert, soweit Browser/OS es unterstützt.
- Einschränkungen werden klar dokumentiert.

### Fehler-Priorität

- P1, wenn Safari offiziell unterstützt werden soll und Kernfunktion bricht.
- P2, wenn Einschränkung sauber dokumentiert und nicht MVP-kritisch ist.

### Bitte zurückmelden

```text
TEST-ID: RTC-BRW-004
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
ARTIFACTS:
NOTES:
```

---

## RTC-AUD-004 — Low Latency Audio Mode

### Ziel

Prüfen, ob Low-Latency-Modus aktivierbar ist und keine Audio-Regression erzeugt.

### Voraussetzung

- Channel: `voice-low-latency`.
- User A und User B.

### Schritte

1. Beide joinen `voice-low-latency`.
2. Prüfe, ob Low-Latency-Modus im UI/Channel aktiv ist.
3. Beide sprechen abwechselnd.
4. Prüfe subjektive Verzögerung.
5. Prüfe WebRTC Stats.
6. Beide verlassen Channel.

### Erwartetes Ergebnis

- Audio funktioniert.
- Verzögerung ist niedrig.
- Keine deutlich stärkeren Aussetzer als im Default-Modus.
- UI zeigt Modus korrekt.

### Fehler-Priorität

- Fail = P1, wenn Modus Voice verschlechtert.
- Fail = P2, wenn nur UI/Anzeige unklar ist.

### Bitte zurückmelden

```text
TEST-ID: RTC-AUD-004
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
  Audio RTT:
  Jitter:
  Packet Loss:
  Subjective latency:
ARTIFACTS:
NOTES:
```

---

## RTC-AUD-006 — Music Mode

### Ziel

Prüfen, ob Music Mode funktioniert und Audioverarbeitung wie Echo Cancellation/Noise Suppression nicht unerwartet die Qualität zerstört.

### Voraussetzung

- Channel: `voice-music-mode`.
- User A spielt Testmusik oder Instrument/Ton ab.
- User B hört zu.

### Schritte

1. Beide joinen `voice-music-mode`.
2. User A aktiviert Music Mode, falls manuell nötig.
3. User A spielt Testaudio/Musik ab.
4. User B prüft Qualität.
5. User A spricht normal.
6. User B prüft Verständlichkeit.
7. Prüfe Audio Stats.

### Erwartetes Ergebnis

- Musik klingt nicht extrem abgeschnitten oder gepumpt.
- Sprache bleibt verständlich.
- Keine starken Aussetzer.
- UI zeigt Music Mode korrekt.

### Fehler-Priorität

- Fail = P1, wenn Music Mode Voice unbrauchbar macht.
- Fail = P2, wenn Qualität nur nicht optimal ist.

### Bitte zurückmelden

```text
TEST-ID: RTC-AUD-006
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
  Audio bitrate:
  Packet Loss:
  Subjective quality:
ARTIFACTS:
NOTES:
```

---

## RTC-OBS-001 — WebRTC Quality UI

### Ziel

Prüfen, ob die App sichtbare und plausible Qualitätsinformationen anzeigt.

### Voraussetzung

- User A und User B in Voice.
- Debug-Tools offen.

### Schritte

1. User A und User B joinen Voice.
2. Prüfe UI-Qualitätsindikator.
3. Vergleiche UI grob mit WebRTC Stats.
4. Starte Screenshare.
5. Prüfe, ob Videoqualität/FPS/Auflösung sichtbar oder ableitbar ist.
6. Simuliere optional schlechte Verbindung mit Netem.

### Erwartetes Ergebnis

- UI zeigt Verbindung/Qualität sinnvoll an.
- Schlechte Qualität wird erkennbar.
- Werte sind nicht offensichtlich falsch.

### Fehler-Priorität

- Fail = P1, wenn schlechte Qualität nicht sichtbar wird.
- Fail = P2, wenn nur Details fehlen.

### Bitte zurückmelden

```text
TEST-ID: RTC-OBS-001
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
  UI quality:
  Actual RTT:
  Actual Packet Loss:
  Candidate Type:
ARTIFACTS:
NOTES:
```

---

## RTC-SEC-001 — Keine privaten Voice-Leaks

### Ziel

Prüfen, dass Nutzer keine Voice States, Events oder Channel-Informationen von privaten Channels sehen.

### Voraussetzung

- Channel: `private-voice-no-access`.
- User A hat Zugriff.
- `novoice@test.local` oder anderer nicht berechtigter Nutzer hat keinen Zugriff.

### Schritte

1. User A joined `private-voice-no-access`.
2. Nicht berechtigter User öffnet Workspace.
3. Prüfe Channel Tree.
4. Prüfe WebSocket Events im Browser Network Tab.
5. Prüfe, ob Voice State oder Speaking Events sichtbar sind.
6. Nicht berechtigter User versucht direkten API-Join, falls möglich.

### Erwartetes Ergebnis

- Privater Channel ist unsichtbar oder nicht betretbar.
- Keine Voice States werden geleakt.
- Keine Speaking Events werden geleakt.
- Direkter API-Join ergibt 403.
- Kein SFU Token.

### Fehler-Priorität

- Fail = P0.

### Bitte zurückmelden

```text
TEST-ID: RTC-SEC-001
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
  Private channel visible: yes/no
  Private voice events visible: yes/no
  API status:
  Token issued: yes/no
ARTIFACTS:
NOTES:
```

---

# 9. Empfohlene Testreihenfolge

Codex soll diese Reihenfolge einhalten:

```text
RTC-PRE-001
RTC-AUD-001
RTC-AUD-002
RTC-AUD-003
RTC-MOD-001
RTC-MOD-002
RTC-PERM-001
RTC-PERM-002
RTC-PERM-003
RTC-AUD-005
RTC-REC-001
RTC-REC-002
RTC-REC-003
RTC-CAM-001
RTC-CAM-002
RTC-SCR-001
RTC-SCR-002
RTC-4K-001
RTC-TURN-001
RTC-TURN-002
RTC-NET-001
RTC-NET-002
RTC-NET-003
RTC-BRW-001
RTC-BRW-002
RTC-BRW-003
RTC-BRW-004
RTC-AUD-004
RTC-AUD-006
RTC-OBS-001
RTC-SEC-001
RTC-AUD-020
```

`RTC-AUD-020` erst ausführen, wenn Basistests stabil sind.

---

# 10. Wann Codex stoppen soll

Codex soll stoppen und nicht einfach weitertesten, wenn einer dieser Fälle eintritt:

```text
- RTC-AUD-001 schlägt mit P0 fehl.
- RTC-PERM-001 schlägt fehl.
- RTC-PERM-002 schlägt mit Audio-Leak fehl.
- RTC-MOD-001 schlägt mit umgehbarem Server Mute fehl.
- RTC-SEC-001 schlägt fehl.
- SFU/API/Gateway crasht.
- TURN Credentials enthalten Secrets oder langfristige Zugangsdaten.
```

Dann soll Codex sagen:

```text
Dieser Fehler blockiert weitere sinnvolle RTC-QA. Ich habe ihn als P0 dokumentiert. Nächster sinnvoller Schritt ist ein gezielter Fix für <TEST-ID>, danach wird dieser Test wiederholt.
```

---

# 11. Codex-Fixmodus nach der manuellen QA

Erst nach ausdrücklicher Freigabe soll Codex Code ändern.

Prompt für Fixmodus:

```text
Lies:
- docs/qa/rtc-test-results-v0.1.0-rc1.md
- docs/qa/rtc-codex-interactive-playbook.md
- docs/rtc.md
- docs/permissions.md
- docs/security.md
- docs/testing.md

Behebe ausschließlich die P0-Fehler aus dem RTC-Testreport.

Regeln:
- Keine neuen Features.
- Keine UI-Spielereien.
- Jeder Fix muss auf eine konkrete Test-ID verweisen.
- Ergänze automatisierte Tests, wo sinnvoll.
- Aktualisiere den Testreport mit „fixed in commit“.
- Führe pnpm lint, pnpm test und pnpm build aus.
- Gib am Ende an, welche manuellen RTC-Tests erneut ausgeführt werden müssen.
```

---

# 12. Rückmeldevorlage für Tester

Tester kann immer diese Vorlage benutzen:

```text
TEST-ID:
STATUS: PASS / FAIL / BLOCKED / SKIPPED
BROWSER/OS:
USERS:
CHANNEL:
ACTUAL RESULT:
METRICS:
  Join Time:
  ICE State:
  Candidate Type:
  Transport:
  Audio RTT:
  Audio Jitter:
  Audio Packet Loss:
  Audio Bitrate:
  Video Resolution:
  Video FPS:
  Video Bitrate:
ARTIFACTS:
  Screenshot:
  WebRTC Dump:
  Logs:
  Grafana:
NOTES:
```

---

# 13. Kurzprompt für Codex innerhalb des Repos

Diesen Prompt kannst du direkt in Codex verwenden:

```text
Wir machen jetzt die manuelle RTC-QA für OpenVoice v0.1.0-rc1 interaktiv.

Lies zuerst:
- AGENTS.md
- PLANS.md
- docs/lastenheft.md
- docs/rtc.md
- docs/permissions.md
- docs/security.md
- docs/deployment.md
- docs/testing.md
- docs/observability.md
- docs/qa/rtc-codex-interactive-playbook.md

Arbeitsmodus:
- Gib mir immer genau einen Testfall aus dem Playbook.
- Starte mit RTC-PRE-001.
- Erkläre kurz Ziel, Voraussetzung, Schritte und erwartetes Ergebnis.
- Gib mir danach die Rückmeldevorlage.
- Warte auf meine Rückmeldung.
- Wenn ich antworte, dokumentiere das Ergebnis in docs/qa/rtc-test-results-v0.1.0-rc1.md.
- Bei PASS: gib den nächsten Test.
- Bei FAIL: klassifiziere als P0/P1/P2, dokumentiere den Bug und entscheide, ob wir stoppen müssen.
- Bei BLOCKED: dokumentiere Blocker und schlage den nächsten sinnvollen Schritt vor.
- Ändere keinen Produktcode, solange ich nicht ausdrücklich „Fixmodus“ sage.
- Keine neuen Features.
- Keine Refactors.

Beginne jetzt mit RTC-PRE-001.
```

---

# 14. Mini-Prompt für Fortsetzung

Wenn die Codex-Session unterbrochen wurde:

```text
Setze die manuelle RTC-QA fort.

Lies:
- docs/qa/rtc-codex-interactive-playbook.md
- docs/qa/rtc-test-results-v0.1.0-rc1.md

Finde den nächsten noch nicht bestandenen oder noch nicht ausgeführten Test in der empfohlenen Reihenfolge.
Gib mir genau diesen Testfall mit Ziel, Voraussetzung, Schritten, Erwartung und Rückmeldevorlage.
Ändere keinen Produktcode.
```

---

# 15. Mini-Prompt für P0-Fix nach Stop

```text
Wir haben einen P0-Fehler in der manuellen RTC-QA.

Lies:
- docs/qa/rtc-test-results-v0.1.0-rc1.md
- docs/qa/rtc-codex-interactive-playbook.md
- docs/rtc.md
- docs/permissions.md
- docs/security.md
- docs/testing.md

Behebe ausschließlich den P0 zu TEST-ID: <TEST-ID>.

Regeln:
- Kein anderer Scope.
- Keine neuen Features.
- Test ergänzen oder erweitern.
- pnpm lint, pnpm test, pnpm build ausführen.
- Dokumentiere, welche manuellen Tests danach wiederholt werden müssen.
```

---

# 16. Abschluss der manuellen QA

Wenn alle relevanten Tests abgeschlossen sind, soll Codex einen Abschlussbericht erstellen:

```text
Erstelle aus docs/qa/rtc-test-results-v0.1.0-rc1.md einen Abschlussbericht:

docs/qa/rtc-final-report-v0.1.0-rc1.md

Der Bericht muss enthalten:
- Gesamtstatus: GO / NO-GO
- bestandene Tests
- fehlgeschlagene Tests
- blockierte Tests
- übersprungene Tests mit Grund
- offene P0
- offene P1
- offene P2
- wichtigste RTC-Metriken
- Browser-Kompatibilität
- TURN-Ergebnis
- 4K-Ergebnis
- Reconnect-Ergebnis
- konkrete nächste Schritte
```
