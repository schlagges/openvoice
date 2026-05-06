# OpenVoice v0.1.0 Manual RTC Test Plan

Datum: 2026-05-05

Scope: manuelle Release-/Closed-Beta-Pruefung fuer WebRTC-Audio, Kamera, Screenshare, SFU,
coturn, TURN-Fallbacks, Reconnect-Verhalten und relevante Moderationsaktionen. Dieser Plan ist
kein Feature-Scope. Er prueft den aktuellen OpenVoice-RTC-Stand gegen `docs/lastenheft.md`,
`docs/rtc.md`, `docs/testing.md`, `docs/deployment.md` und die aktuellen Voice-/Media-Codepfade.

## 1. Gemeinsame Voraussetzungen

- OpenVoice Stack laeuft ueber Docker Compose mit API, Web, PostgreSQL, Valkey, LiveKit, coturn,
  Prometheus und Grafana.
- `.env` ist aus `.env.example` abgeleitet und enthaelt echte lokale Secrets fuer
  `SESSION_SECRET`, `CSRF_SECRET`, `PASSWORD_PEPPER`, `AUDIT_IP_HASH_SECRET`,
  `TURN_SHARED_SECRET`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `POSTGRES_PASSWORD` und
  `GRAFANA_ADMIN_PASSWORD`.
- `CORS_ALLOWED_ORIGINS` enthaelt die verwendete Web-Origin.
- Fuer TURNS-Tests ist coturn mit gueltigem TLS-Zertifikat oder einer explizit dokumentierten
  lokalen Test-CA konfiguriert.
- Mindestens ein Workspace mit einem Voice- oder Combined-Channel existiert.
- Testnutzer besitzen fuer den Testchannel mindestens `VIEW_CHANNEL` und `CONNECT_VOICE`.
- Fuer Audio-Publish-Tests besitzen sprechende Nutzer `SPEAK`.
- Fuer Kamera-Tests besitzen sendende Nutzer `STREAM_CAMERA`.
- Fuer Screenshare-Tests besitzen sendende Nutzer `SHARE_SCREEN`; fuer 4K zusaetzlich
  `SHARE_SCREEN_4K`.
- Server-Mute/Deafen-Tester besitzt `MUTE_MEMBERS` bzw. `DEAFEN_MEMBERS` und kann den Zielchannel
  sehen.
- Browser werden in separaten Profilen, Containern oder Geraeten ausgefuehrt, damit Cookies,
  Sessions und Mediengeraete sauber getrennt sind.

## 2. Gemeinsame Messpunkte

Primaere Quellen:

- Browser DevTools: WebRTC internals, Console, Network, Media devices.
- LiveKit Server Logs und Room/Participant-Statistiken.
- OpenVoice `/metrics` und Grafana/Prometheus.
- coturn Logs und Prometheus-Metriken auf `:9641`.
- Clientseitige OpenVoice RTC-Stats, soweit im aktuellen UI/API-Fluss erreichbar.

Zu erfassende Metriken:

- Join Time: Klick/API-Aufruf bis LiveKit Room connected.
- Reconnect Time: Netzereignis bis Audio wieder bidirektional funktioniert.
- Voice State Event Latency: Aktion bis sichtbarer Status bei anderem Nutzer.
- Mouth-to-Ear Audio Latency: manuell per Klatsch-/Tonmarke oder Mess-App.
- Audio Paketverlust, Jitter, RTT, Concealed Samples.
- Video/Screenshare Aufloesung, FPS, Bitrate, Frames dropped.
- ICE Candidate Type: host, srflx, relay.
- Transportprotokoll: udp, tcp, tls/tls-over-tcp.
- TURN Relay ja/nein.
- SFU Teilnehmerzahl, aktive Rooms, CPU/RAM soweit verfuegbar.

Basis-Bestehensgrenzen unter Normalbedingungen:

| Metrik | Grenze |
| --- | --- |
| Audio Join Time P95 | <= 2,0 s |
| Audio Mouth-to-Ear P50 | <= 80 ms |
| Audio Mouth-to-Ear P95 | <= 150 ms |
| Voice State Event P95 | <= 250 ms |
| Mute/Unmute lokal | <= 50 ms |
| Mute/Unmute sichtbar fuer andere P95 | <= 250 ms |
| 1080p Screenshare Glass-to-Glass P95 | <= 500 ms |
| 4K Screenshare Glass-to-Glass P95 | <= 700 ms |
| Reconnect nach Netzwechsel P95 | <= 5 s |

Fehlerklassifikation:

| Klasse | Bedeutung |
| --- | --- |
| Blocker | Test kann nicht gestartet werden, Medienverbindung kommt nicht zustande, Security-/Permission-Bypass, Crash aller Clients oder SFU/coturn nicht nutzbar. |
| Critical | Kernfunktion bricht fuer mehrere Nutzer oder Fallback-Pfad aus; Audio nicht stabil; falsche Server-Mute/Deafen-Durchsetzung; private Rechte werden verletzt. |
| Major | Funktion nutzbar, aber Grenzwert deutlich verfehlt, Reconnect unzuverlaessig, Qualitaet fuer Closed Beta unzureichend. |
| Minor | Messwert knapp ausserhalb Ziel, UI-/Statusanzeige inkonsistent, Workaround vorhanden. |
| Informational | Browser-/Geraetegrenze, erwartete adaptive Degradation, kosmetische Auffaelligkeit ohne RTC-Auswirkung. |

## 3. Testmatrix

Jeder Test wird mindestens mit Chrome/Chromium auf Desktop ausgefuehrt. Browser-Kompatibilitaet wird
zusaetzlich nach Abschnitt 25 geprueft.

### RTC-001: 2 Nutzer Audio

Voraussetzungen:

- Zwei angemeldete Nutzer A und B.
- Beide im gleichen Voice- oder Combined-Channel.
- Beide haben `VIEW_CHANNEL`, `CONNECT_VOICE` und `SPEAK`.
- Mikrofone und Lautsprecher funktionieren lokal.

Schritte:

1. Nutzer A tritt dem Voice-Channel bei.
2. Nutzer B tritt demselben Voice-Channel bei.
3. A spricht 30 Sekunden kontinuierlich, danach B 30 Sekunden.
4. Beide sprechen 30 Sekunden im Wechsel.
5. RTC-Stats und LiveKit-Teilnehmerstatus erfassen.

Erwartetes Ergebnis:

- Beide Clients verbinden sich mit demselben LiveKit Room.
- Audio ist bidirektional hoerbar.
- Keine Echo-Schleifen, keine dauerhaften Aussetzer.
- Speaking Indicator reagiert auf aktive Sprecher.

Metriken:

- Join Time je Nutzer.
- Mouth-to-Ear P50/P95.
- RTT, Jitter, Paketverlust, Concealed Samples.
- ICE Candidate Type und Transportprotokoll.

Bestehensgrenze:

- Join Time P95 <= 2,0 s.
- Mouth-to-Ear P95 <= 150 ms bei RTT <= 50 ms und Paketverlust <= 1 %.
- Kein Audioausfall > 1 s.
- Paketverlust im Browser-Stats <= 1 % im Normalnetz.

Fehlerklassifikation:

- Blocker: kein bidirektionales Audio.
- Critical: Audio nur einseitig, falscher Room, Permission-Bypass.
- Major: Join > 2 s P95 oder wiederholte Aussetzer.
- Minor: einzelne kurze Artefakte ohne Grenzwertverletzung.

### RTC-002: 5 Nutzer Audio

Voraussetzungen:

- Fuenf angemeldete Nutzer in getrennten Browserprofilen oder Geraeten.
- Alle besitzen `VIEW_CHANNEL`, `CONNECT_VOICE`, `SPEAK`.
- Headsets nutzen, um akustische Rueckkopplung zu vermeiden.

Schritte:

1. Nutzer 1 bis 5 treten nacheinander demselben Voice-Channel bei.
2. Jeder Nutzer spricht 20 Sekunden allein.
3. Zwei Nutzer sprechen gleichzeitig 20 Sekunden.
4. Alle bleiben 10 Minuten verbunden.
5. Stats fuer jeden Client und SFU erfassen.

Erwartetes Ergebnis:

- Alle Nutzer hoeren den jeweils aktiven Sprecher.
- SFU bleibt stabil; keine Peer-to-Peer-Mesh-Anzeichen als primaerer Pfad.
- Active Speaker Updates bleiben plausibel.

Metriken:

- Join Time pro Nutzer.
- Audio RTT/Jitter/Paketverlust je Empfaenger.
- SFU Room Participant Count.
- CPU/RAM auf API, LiveKit und Client.

Bestehensgrenze:

- Alle 5 Nutzer bleiben 10 Minuten verbunden.
- Kein Client verliert Audio dauerhaft.
- Durchschnittlicher Paketverlust <= 1 % im Normalnetz.
- Voice State Event P95 <= 250 ms.

Fehlerklassifikation:

- Blocker: Raum mit 5 Nutzern nicht herstellbar.
- Critical: SFU/Room instabil oder mehrere Nutzer hoeren nichts.
- Major: einzelne Nutzer verlieren Audio wiederholt.
- Minor: vereinzelte Sprecheranzeige-Fehler.

### RTC-003: 20 Nutzer Audio

Voraussetzungen:

- 20 Testnutzer, bevorzugt verteilt auf mehrere physische Hosts oder kontrollierte Browserprofile.
- Testleiter mit Zugriff auf LiveKit, API, Prometheus und Host-Metriken.
- Alle Nutzer haben `VIEW_CHANNEL`, `CONNECT_VOICE`, `SPEAK`.

Schritte:

1. 20 Nutzer treten innerhalb von 5 Minuten demselben Voice-Channel bei.
2. Jeder fuenfte Nutzer spricht nacheinander 30 Sekunden.
3. Drei Nutzer sprechen gleichzeitig 30 Sekunden.
4. Raum bleibt 20 Minuten verbunden.
5. Waehrenddessen CPU/RAM, LiveKit Participant Count, API Metrics und Browser RTC Stats erfassen.

Erwartetes Ergebnis:

- Audio bleibt fuer aktive Sprecher verstaendlich.
- SFU leitet selektiv weiter und bleibt stabil.
- Keine API-/Gateway-/Presence-Flut oder Disconnect-Kaskade.

Metriken:

- Join Time P50/P95.
- Audio Packet Loss, RTT, Jitter je Stichprobe.
- LiveKit CPU/RAM und Teilnehmerzahl.
- API Voice Join Success/Failure, Gateway Disconnects.

Bestehensgrenze:

- Mindestens 19 von 20 Nutzern bleiben ueber 20 Minuten verbunden.
- Keine SFU- oder API-Prozess-Neustarts.
- Audio fuer aktive Sprecher bleibt verstaendlich; Paketverlust im Normalnetz <= 1 %.
- Join Time P95 <= 2,0 s, sofern Host nicht CPU-limitiert ist.

Fehlerklassifikation:

- Blocker: Test laesst sich wegen Stack-Crash nicht abschliessen.
- Critical: mehr als 1 Nutzer dauerhaft getrennt oder SFU instabil.
- Major: deutliche Audioartefakte bei mehreren Nutzern.
- Minor: einzelne schwache Clients degradieren ohne Auswirkung auf andere.

### RTC-004: Self Mute

Voraussetzungen:

- Zwei Nutzer sind im gleichen Voice-Channel verbunden.
- Nutzer A darf sprechen.

Schritte:

1. A spricht, B bestaetigt Audioempfang.
2. A aktiviert Self Mute.
3. A spricht weiter fuer 10 Sekunden.
4. A deaktiviert Self Mute.
5. B bestaetigt erneuten Audioempfang.

Erwartetes Ergebnis:

- Lokales Mikrofon wird sofort deaktiviert.
- B hoert A waehrend Self Mute nicht.
- Status wird bei B sichtbar.
- Nach Unmute ist Audio wieder da.

Metriken:

- Lokale Mute-Latenz.
- Remote Status Event Latenz.
- Audio Track enabled/published Status.

Bestehensgrenze:

- Lokale Rueckmeldung <= 50 ms.
- Remote Status P95 <= 250 ms.
- Kein Audio waehrend Self Mute.

Fehlerklassifikation:

- Critical: A bleibt trotz Self Mute hoerbar.
- Major: Remote Status fehlt oder Unmute stellt Audio nicht wieder her.
- Minor: Anzeige verzoegert, Audio korrekt.

### RTC-005: Self Deafen

Voraussetzungen:

- Zwei Nutzer im gleichen Voice-Channel.
- A und B koennen Audio senden und empfangen.

Schritte:

1. B spricht, A bestaetigt Audioempfang.
2. A aktiviert Self Deafen.
3. B spricht weiter.
4. Pruefen, ob A keine Remote-Audioausgabe mehr hoert.
5. Pruefen, ob A selbst nicht mehr sendet.
6. A deaktiviert Self Deafen.

Erwartetes Ergebnis:

- A hoert keine anderen Nutzer.
- A sendet selbst kein Mikrofon-Audio.
- Nach Undeafen funktioniert Audio wieder.

Metriken:

- Lokale Deafen-Latenz.
- Remote Status Event Latenz.
- Lokaler Mikrofon-Track-Status.

Bestehensgrenze:

- Deafen Feedback <= 50 ms.
- Remote Status P95 <= 250 ms.
- Kein Publish waehrend Self Deafen.

Fehlerklassifikation:

- Critical: Self Deafen sendet weiter Audio.
- Major: A hoert weiterhin Remote Audio.
- Minor: Statusanzeige verzoegert.

### RTC-006: Server Mute

Voraussetzungen:

- Moderator M besitzt `MUTE_MEMBERS` und `VIEW_CHANNEL`.
- Zielnutzer A ist im Voice-Channel und darf sprechen.
- Nutzer B hoert A.

Schritte:

1. A spricht, B bestaetigt Audioempfang.
2. M setzt Server Mute fuer A.
3. A versucht weiter zu sprechen.
4. A refresht optional den Browser und tritt erneut bei.
5. M entfernt Server Mute.

Erwartetes Ergebnis:

- A verliert serverseitig Audio-Publish-Recht.
- B hoert A nach Server Mute nicht mehr.
- Server Mute bleibt ueber Rejoin/Refresh wirksam.
- Nach Entfernen kann A wieder sprechen, sofern `SPEAK` erlaubt ist.

Metriken:

- API Response Status.
- LiveKit Publish Permission/Track Mute Status.
- Remote Status Event Latenz.
- Audit Log Event `VOICE_SERVER_MUTE`.

Bestehensgrenze:

- Server Mute Wirkung P95 <= 250 ms.
- Kein Audio von A waehrend Server Mute.
- Audit Log Eintrag vorhanden.

Fehlerklassifikation:

- Critical: A kann trotz Server Mute senden.
- Major: Server Mute verschwindet nach Refresh/Rejoin.
- Minor: Statusanzeige verzoegert, Enforcement korrekt.

### RTC-007: Server Deafen

Voraussetzungen:

- Moderator M besitzt `DEAFEN_MEMBERS` und `VIEW_CHANNEL`.
- Zielnutzer A ist im Voice-Channel.
- Nutzer B ist ebenfalls im Channel.

Schritte:

1. B spricht, A bestaetigt Audioempfang.
2. M setzt Server Deafen fuer A.
3. B spricht weiter.
4. A versucht selbst zu sprechen.
5. M entfernt Server Deafen.

Erwartetes Ergebnis:

- A darf nicht weiter Audio senden.
- A soll keine Remote-Audioausgabe mehr erhalten, soweit der Client/SFU-State dies unterstuetzt.
- Status wird fuer andere sichtbar.
- Audit Log enthaelt `VOICE_SERVER_DEAFEN`.

Metriken:

- API Response Status.
- LiveKit Publish Permission/Track Status.
- Remote Status Event Latenz.
- Audit Log.

Bestehensgrenze:

- Publish wird P95 <= 250 ms deaktiviert.
- Kein Audio von A waehrend Server Deafen.
- Audit Log Eintrag vorhanden.

Fehlerklassifikation:

- Critical: A kann trotz Server Deafen senden.
- Major: Server-Deafen-State wird nicht persistiert oder nicht angezeigt.
- Minor: Empfangs-Deafen ist browserseitig uneinheitlich, Publish-Enforcement korrekt.

### RTC-008: Reconnect bei kurzem Verbindungsabbruch

Voraussetzungen:

- Zwei Nutzer im Voice-Channel.
- Zugriff auf Browser DevTools oder OS-Netzwerksteuerung.

Schritte:

1. A und B verbinden und bestaetigen Audio.
2. Bei A Netzwerk fuer 3 Sekunden unterbrechen.
3. Netzwerk wieder aktivieren.
4. Beobachten, ob LiveKit reconnectet oder OpenVoice rejoin benoetigt.
5. Audio in beide Richtungen pruefen.

Erwartetes Ergebnis:

- Verbindung erholt sich ohne neuen Login.
- Voice State bleibt konsistent.
- Audio funktioniert wieder.

Metriken:

- Disconnect-Dauer.
- Reconnect Time.
- Anzahl ICE Restarts/Reconnections.
- Gateway Disconnect/Presence Events.

Bestehensgrenze:

- Reconnect P95 <= 5 s bei kurzem Abbruch.
- Kein stale Voice State nach Reconnect.

Fehlerklassifikation:

- Critical: Reconnect nie moeglich ohne Logout/Login.
- Major: Reconnect > 5 s oder Voice State bleibt falsch.
- Minor: Status kurzzeitig falsch, erholt sich selbst.

### RTC-009: Browser Refresh

Voraussetzungen:

- A und B im Voice-Channel.
- A hat gueltige Session und CSRF Token.

Schritte:

1. A spricht, B hoert.
2. A laedt die Seite neu.
3. A tritt demselben Voice-Channel wieder bei.
4. B beobachtet Leave/Join/Presence/Voice State.
5. Audio erneut pruefen.

Erwartetes Ergebnis:

- Refresh erzeugt keinen dauerhaften doppelten Voice State.
- A kann mit gleicher Session wieder joinen.
- Audio funktioniert nach Rejoin.

Metriken:

- Zeit bis rejoin moeglich.
- Anzahl Voice States fuer A.
- LiveKit Participant Count.

Bestehensgrenze:

- Kein doppelter Participant/Voice State laenger als 10 s.
- Rejoin erfolgreich <= 5 s nach Page Ready.

Fehlerklassifikation:

- Critical: Refresh blockiert Rejoin dauerhaft.
- Major: Doppelter Teilnehmer bleibt dauerhaft bestehen.
- Minor: Kurzzeitiger stale State unter 10 s.

### RTC-010: Netzwechsel

Voraussetzungen:

- Laptop oder Mobilgeraet mit zwei Netzen, z. B. WLAN und Hotspot.
- Zwei Nutzer im Voice-Channel.

Schritte:

1. A verbindet ueber Netz 1 und spricht mit B.
2. A wechselt auf Netz 2.
3. Reconnect abwarten.
4. A wechselt zurueck auf Netz 1.
5. Audio und Presence pruefen.

Erwartetes Ergebnis:

- ICE/LiveKit Verbindung erholt sich oder Rejoin ist ohne erneute Auth moeglich.
- Audio wird wiederhergestellt.
- Presence/Voice State bleiben konsistent.

Metriken:

- Reconnect Time je Wechsel.
- ICE Candidate Type vor/nach Wechsel.
- Paketverlust/Jitter waehrend Reconnect.

Bestehensgrenze:

- Reconnect P95 <= 5 s.
- Kein dauerhafter Ghost Participant.

Fehlerklassifikation:

- Critical: Netzwechsel zerstoert Session/Voice State dauerhaft.
- Major: Reconnect > 5 s in wiederholten Laeufen.
- Minor: einmalige manuelle Rejoin-Aktion erforderlich, dokumentiert.

### RTC-011: Kamera 720p

Voraussetzungen:

- Nutzer A hat Kamera und `STREAM_CAMERA`.
- Nutzer B ist im gleichen Voice-Channel.
- Browser erlaubt Kamera.

Schritte:

1. A tritt Voice-Channel bei.
2. A aktiviert Kamera mit Profil `720p`.
3. B betrachtet Video von A.
4. A deaktiviert Kamera.

Erwartetes Ergebnis:

- Kamera-Capture wird mit Ziel 1280x720 bei 30 FPS angefragt.
- B sieht den Stream.
- Nach Deaktivierung verschwindet der Stream.

Metriken:

- Aufloesung/FPS aus WebRTC Stats.
- Video Bitrate, Frames dropped.
- CPU auf A.

Bestehensgrenze:

- Effektive Aufloesung >= 960x540, Ziel 1280x720 bei stabilem Netz.
- FPS >= 24 im Normalnetz.
- Kein Audioverlust durch Kamera.

Fehlerklassifikation:

- Critical: Kamera-Start bricht Audio oder Room.
- Major: Stream kommt bei B nicht an.
- Minor: Browser/Geraet liefert niedrigere Aufloesung, aber Degradation ist plausibel.

### RTC-012: Kamera 1080p

Voraussetzungen:

- Kamera unterstuetzt 1080p.
- A besitzt `STREAM_CAMERA`.
- Ausreichend Bandbreite und CPU.

Schritte:

1. A aktiviert Kamera mit Profil `1080p`.
2. B beobachtet Stream 2 Minuten.
3. Stats erfassen.
4. A deaktiviert Kamera.

Erwartetes Ergebnis:

- Kamera-Capture wird mit Ziel 1920x1080 bei 30 FPS angefragt.
- Stream bleibt stabil oder degradierte Schicht ist nachvollziehbar.
- Audio bleibt priorisiert.

Metriken:

- Aufloesung, FPS, Bitrate, Frames dropped.
- Audio Paketverlust parallel.
- CPU/GPU-Last.

Bestehensgrenze:

- Bei geeignetem Geraet >= 1280x720 stabil, Ziel 1080p.
- Audio Paketverlust bleibt <= 1 % im Normalnetz.
- Keine dauerhafte Video-Freeze > 2 s.

Fehlerklassifikation:

- Critical: Audio wird durch Kamera unbrauchbar.
- Major: 1080p faellt ohne Ressourcen-/Netzgrund dauerhaft aus.
- Minor: adaptive Reduktion bei schwachem Geraet.

### RTC-013: Screenshare 1080p

Voraussetzungen:

- A besitzt `SHARE_SCREEN`.
- B ist im gleichen Voice-Channel.
- Testquelle mit bewegten und scharfen Inhalten vorhanden.

Schritte:

1. A aktiviert Screenshare mit Profil `1080p` und Modus `detail`.
2. A teilt Monitor/Fenster/Tab.
3. B prueft Lesbarkeit und Bewegung.
4. A beendet Screenshare ueber Browser-Indikator.

Erwartetes Ergebnis:

- Browser zeigt Screen Capture Dialog.
- Zielprofil ist 1920x1080 bei 30 FPS.
- Detailmodus bevorzugt Aufloesung vor FPS.
- Serverstate wird beim Browser-Stop zurueckgesetzt.

Metriken:

- Glass-to-Glass Latenz.
- Aufloesung, FPS, Bitrate, Frames dropped.
- Audio Paketverlust parallel.

Bestehensgrenze:

- Glass-to-Glass P95 <= 500 ms im Normalnetz.
- Text im geteilten Inhalt bleibt lesbar.
- Audio bleibt stabil.

Fehlerklassifikation:

- Critical: Screenshare startet nicht trotz Recht und Browser-Support.
- Major: Stream friert wiederholt ein oder Stop-State bleibt falsch.
- Minor: FPS reduziert, Aufloesung/Audio bleiben brauchbar.

### RTC-014: Screenshare 4K

Voraussetzungen:

- 4K-Display oder 4K-Testquelle.
- A besitzt `SHARE_SCREEN` und `SHARE_SCREEN_4K`.
- A und B haben ausreichend CPU/GPU und Bandbreite.
- Browser unterstuetzt 4K-Capture soweit moeglich.

Schritte:

1. A aktiviert Screenshare mit Profil `4k` und Modus `detail`.
2. A teilt 4K-Monitor oder 4K-Fenster.
3. B fokussiert den Screenshare.
4. 5 Minuten laufen lassen.
5. Netzwerk leicht belasten und adaptive Degradation beobachten.

Erwartetes Ergebnis:

- Client fragt 3840x2160 bei 30 FPS an.
- SFU/Browser duerfen adaptiv degradieren.
- Bei Ueberlast wird bevorzugt FPS reduziert, Audio bleibt stabil.

Metriken:

- Angefragte und effektive Aufloesung.
- FPS, Bitrate, Frames dropped.
- Glass-to-Glass Latenz.
- Audio Packet Loss/Jitter.

Bestehensgrenze:

- 4K wird angefragt und in Stats oder Browser-Capture bestaetigt.
- Bei geeigneter Umgebung effektive Hoehe >= 1440p, Ziel 2160p.
- Glass-to-Glass P95 <= 700 ms, wenn 4K effektiv gehalten wird.
- Audio bleibt stabil.

Fehlerklassifikation:

- Critical: Nutzer ohne `SHARE_SCREEN_4K` kann 4K starten.
- Major: Nutzer mit Recht kann 4K nicht anfragen, obwohl Browser/Geraet geeignet sind.
- Minor: Browser/Geraet degradieren unter dokumentierten Grenzen.

### RTC-015: TURN UDP

Voraussetzungen:

- coturn laeuft.
- TURN UDP Port 3478 und Relay Range sind erreichbar.
- Direkte SFU UDP-Pfade koennen optional blockiert werden, um Relay zu erzwingen.

Schritte:

1. A und B treten Voice-Channel bei.
2. Direkte Peer/SFU-Kandidaten so einschraenken, dass TURN UDP genutzt wird.
3. Audio 2 Minuten testen.
4. ICE Candidate Type und Transport erfassen.

Erwartetes Ergebnis:

- ICE verwendet Relay Candidate.
- Transport ist UDP.
- Audio funktioniert stabil.

Metriken:

- ICE Candidate Type `relay`.
- Transport `udp`.
- RTT/Jitter/Paketverlust.
- coturn Allocation Count.

Bestehensgrenze:

- TURN UDP Verbindung kommt zustande.
- Audio Packet Loss <= 1 % im Normalnetz.
- Join Time P95 <= 2,5 s im Relay-Fall.

Fehlerklassifikation:

- Critical: TURN UDP funktioniert nicht.
- Major: Relay Audio stark instabil.
- Minor: Join langsamer, aber stabil und dokumentiert.

### RTC-016: TURN TCP

Voraussetzungen:

- UDP ist fuer den Client blockiert oder stark eingeschraenkt.
- TURN TCP auf Port 3478 ist erreichbar.

Schritte:

1. UDP fuer Client A blockieren.
2. A tritt Voice-Channel bei.
3. B tritt normal bei.
4. Audio 2 Minuten testen.
5. ICE/Transport erfassen.

Erwartetes Ergebnis:

- ICE nutzt TURN Relay ueber TCP.
- Audio bleibt trotz erhoehter Latenz verstaendlich.

Metriken:

- Candidate Type `relay`.
- Transport `tcp`.
- RTT/Jitter/Paketverlust.
- Join Time.

Bestehensgrenze:

- Verbindung kommt zustande.
- Audio bleibt verstaendlich ohne Aussetzer > 2 s.
- RTT-bedingte Mehrlatenz wird dokumentiert.

Fehlerklassifikation:

- Critical: kein Fallback bei blockiertem UDP.
- Major: TCP Relay verbindet, Audio aber unbrauchbar.
- Minor: hoeherer Jitter, aber nutzbar.

### RTC-017: TURNS

Voraussetzungen:

- coturn TURNS Port 5349 mit gueltigem Zertifikat.
- Client vertraut der CA.
- TURN UDP/TCP optional blockiert, um TURNS zu erzwingen.

Schritte:

1. TURNS-Konfiguration pruefen.
2. UDP und Plain TCP TURN fuer A blockieren.
3. A und B treten Voice-Channel bei.
4. Audio 2 Minuten testen.
5. ICE/Transport und coturn Logs erfassen.

Erwartetes Ergebnis:

- ICE nutzt `turns:` URL ueber TCP/TLS.
- Keine Zertifikatsfehler im Browser.
- Audio funktioniert.

Metriken:

- Candidate Type `relay`.
- Transport TURNS/TCP.
- TLS/coturn Logs.
- RTT/Jitter/Paketverlust.

Bestehensgrenze:

- TURNS Verbindung kommt mit gueltigem Zertifikat zustande.
- Audio ist verstaendlich und stabil.

Fehlerklassifikation:

- Critical: TURNS nicht nutzbar trotz gueltigem Zertifikat.
- Major: Zertifikats-/ICE-Fehler blockiert Closed-Beta-Netze.
- Minor: hoehere Latenz, aber stabil.

### RTC-018: UDP blockiert

Voraussetzungen:

- Testumgebung kann UDP fuer einen Client blockieren.
- TURN TCP und TURNS sind erreichbar.

Schritte:

1. UDP fuer Client A vollstaendig blockieren.
2. A tritt Voice-Channel bei.
3. B tritt normal bei.
4. Audio, Reconnect und ICE-Fallback pruefen.

Erwartetes Ergebnis:

- Client faellt auf TURN TCP oder TURNS zurueck.
- Audio bleibt nutzbar.
- Fehler wird nicht als stiller Join-Success ohne Audio dargestellt.

Metriken:

- Candidate Type und Transport.
- Join Time.
- Audio RTT/Jitter/Paketverlust.

Bestehensgrenze:

- Join erfolgreich ueber TCP/TURNS.
- Audio verstaendlich ohne Ausfall > 2 s.

Fehlerklassifikation:

- Critical: Join erfolgreich, aber kein Audio.
- Major: Fallback scheitert vollstaendig.
- Minor: Fallback dauert laenger, aber Nutzer erholt sich.

### RTC-019: Paketverlust 1 %

Voraussetzungen:

- Netzwerkemulation mit 1 % Paketverlust auf Client A oder Netzwerkpfad zur SFU.
- Zwei Nutzer im Voice-Channel.

Schritte:

1. Baseline ohne Paketverlust erfassen.
2. 1 % Paketverlust aktivieren.
3. A und B sprechen je 2 Minuten.
4. Audio- und Stats-Werte erfassen.

Erwartetes Ergebnis:

- Audio bleibt gut verstaendlich.
- FEC/Concealment kompensiert einzelne Verluste.
- Video/Screenshare darf leicht degradieren.

Metriken:

- Browser Packet Loss, Concealed Samples, Jitter.
- Mouth-to-Ear.
- User-perceived MOS-Notiz.

Bestehensgrenze:

- Audio bleibt ohne Aussetzer > 1 s.
- Mouth-to-Ear P95 bleibt <= 150 ms, wenn RTT <= 50 ms.

Fehlerklassifikation:

- Major: Audio deutlich schlechter als Baseline.
- Minor: hoerbare Einzelartefakte.

### RTC-020: Paketverlust 3 %

Voraussetzungen:

- Netzwerkemulation mit 3 % Paketverlust.
- Zwei Nutzer im Voice-Channel.

Schritte:

1. 3 % Paketverlust aktivieren.
2. A und B sprechen je 2 Minuten.
3. Optional Screenshare parallel starten und Audio priorisieren beobachten.

Erwartetes Ergebnis:

- Audio bleibt grundsaetzlich verstaendlich.
- Video/Screenshare degradiert vor Audio.

Metriken:

- Packet Loss, Concealed Samples, Jitter.
- Audio Aussetzeranzahl.
- Video FPS/Aufloesung bei parallelem Stream.

Bestehensgrenze:

- Keine Audioaussetzer > 2 s.
- Gesprochene Saetze bleiben mehrheitlich verstaendlich.
- Audio priorisiert gegenueber Video.

Fehlerklassifikation:

- Critical: Audio bricht dauerhaft ab.
- Major: Audio unbrauchbar oder Video verdrangt Audio.
- Minor: erwartbare Artefakte.

### RTC-021: Paketverlust 5 %

Voraussetzungen:

- Netzwerkemulation mit 5 % Paketverlust.
- Zwei Nutzer im Voice-Channel.

Schritte:

1. 5 % Paketverlust aktivieren.
2. A und B sprechen je 2 Minuten.
3. Reconnect/ICE-State beobachten.
4. Kamera/Screenshare optional aktivieren und Degradation dokumentieren.

Erwartetes Ergebnis:

- Audio kann degradieren, soll aber moeglichst verbunden bleiben.
- Video/Screenshare darf deutlich degradieren oder pausieren.
- Client darf nicht crashen.

Metriken:

- Packet Loss, Jitter, Concealed Samples.
- Anzahl Reconnects.
- Audio-Ausfallzeit.

Bestehensgrenze:

- Keine Client-/SFU-Crashes.
- Audio bleibt zeitweise verstaendlich oder reconnectet automatisch.
- Fehlerzustand ist sichtbar/dokumentierbar.

Fehlerklassifikation:

- Critical: Client/SFU crash oder haengt dauerhaft.
- Major: Verbindung bleibt scheinbar connected, aber Audio ist dauerhaft tot.
- Minor: starke, aber erwartbare Degradation.

### RTC-022: RTT 50 ms

Voraussetzungen:

- Netzwerkemulation oder Standort mit ca. 50 ms RTT Client zu SFU.
- Zwei Nutzer im Voice-Channel.

Schritte:

1. RTT auf 50 ms setzen.
2. Audio 3 Minuten testen.
3. Optional 1080p Screenshare 2 Minuten testen.
4. Stats erfassen.

Erwartetes Ergebnis:

- Zielbedingungen des Lastenhefts werden eingehalten.
- Audio ist sehr direkt.

Metriken:

- RTT, Mouth-to-Ear, Join Time.
- Screenshare Glass-to-Glass bei optionalem Stream.

Bestehensgrenze:

- Audio P95 <= 150 ms.
- Join P95 <= 2,0 s.
- 1080p Screenshare P95 <= 500 ms.

Fehlerklassifikation:

- Major: Latenzziele bei 50 ms RTT deutlich verfehlt.
- Minor: einzelne Ausreisser.

### RTC-023: RTT 100 ms

Voraussetzungen:

- Netzwerkemulation mit ca. 100 ms RTT.
- Zwei Nutzer im Voice-Channel.

Schritte:

1. RTT auf 100 ms setzen.
2. Audio 3 Minuten testen.
3. Kamera oder Screenshare optional parallel aktivieren.
4. Stats erfassen.

Erwartetes Ergebnis:

- Audio bleibt verstaendlich.
- Latenz steigt erwartbar.
- Audio bleibt vor Video priorisiert.

Metriken:

- RTT, Mouth-to-Ear, Jitter.
- Video/Screenshare Degradation.

Bestehensgrenze:

- Kein Audioausfall > 2 s.
- Unterhaltung bleibt praktikabel.
- Video darf degradieren.

Fehlerklassifikation:

- Critical: Audio bricht dauerhaft.
- Major: Latenz/Artefakte machen Voice praktisch unbrauchbar.
- Minor: spuerbare, aber erwartete Verzoegerung.

### RTC-024: RTT 200 ms

Voraussetzungen:

- Netzwerkemulation mit ca. 200 ms RTT.
- Zwei Nutzer im Voice-Channel.

Schritte:

1. RTT auf 200 ms setzen.
2. Audio 3 Minuten testen.
3. Reconnect und ICE-State beobachten.
4. Optional Screenshare starten und Degradation dokumentieren.

Erwartetes Ergebnis:

- Verbindung bleibt stabil.
- Audio ist verzoegert, aber nicht dauerhaft unterbrochen.
- UI/Status bleibt konsistent.

Metriken:

- RTT, Jitter, Packet Loss, Reconnect Count.
- Audio-Ausfallzeit.

Bestehensgrenze:

- Kein dauerhafter Disconnect.
- Audio bleibt verstaendlich genug fuer einfache Kommunikation.
- Client zeigt keine falschen Connected-Zustaende bei Medienausfall.

Fehlerklassifikation:

- Critical: Stack oder Client crash.
- Major: dauerhafter Medienausfall ohne Recovery.
- Minor: hohe, aber erwartbare Latenz.

### RTC-025: Firefox

Voraussetzungen:

- Aktuelle Firefox ESR oder aktuelle stabile Firefox-Version.
- Kamera/Mikrofon/Screenshare-Berechtigungen gesetzt.

Schritte:

1. RTC-001 ausfuehren.
2. RTC-004 und RTC-005 ausfuehren.
3. RTC-011 und RTC-013 ausfuehren.
4. Wenn moeglich RTC-014 ausfuehren.
5. Browser-spezifische Warnungen dokumentieren.

Erwartetes Ergebnis:

- Audio funktioniert.
- Kamera und Screenshare funktionieren, soweit Firefox APIs sie erlauben.
- 4K darf browser-/geraetebedingt degradieren.

Metriken:

- Join Time, Audio RTT/Jitter/Paketverlust.
- Video/Screenshare Aufloesung/FPS.
- Console Errors.

Bestehensgrenze:

- Audio und 1080p Screenshare bestehen.
- Keine sicherheitsrelevanten Permission-Bypasses.

Fehlerklassifikation:

- Critical: Firefox kann Voice generell nicht nutzen.
- Major: Screenshare/Kamera bricht den Room.
- Minor: Firefox-spezifische Limitierung mit Workaround.

### RTC-026: Chrome/Chromium

Voraussetzungen:

- Aktuelle stabile Chrome- oder Chromium-Version.
- Desktop-Browser mit Medienberechtigungen.

Schritte:

1. RTC-001, RTC-004, RTC-005, RTC-011, RTC-012, RTC-013 und RTC-014 ausfuehren.
2. WebRTC internals exportieren.
3. TURN-Fallback aus RTC-015 bis RTC-018 mindestens einmal mit Chrome/Chromium ausfuehren.

Erwartetes Ergebnis:

- Chrome/Chromium ist Referenzbrowser fuer Closed-Beta-RTC.
- Alle Kernflows funktionieren.

Metriken:

- Vollstaendige Audio-/Video-/ICE-Stats.
- Browser Console und Network Errors.

Bestehensgrenze:

- Alle genannten Kernflows bestehen.
- 4K wird angefragt und bei geeigneter Umgebung mindestens plausibel geliefert oder sauber
  degradiert.

Fehlerklassifikation:

- Critical: Referenzbrowser kann Voice nicht stabil nutzen.
- Major: 1080p/4K oder TURN-Fallback brechen ohne erklaerbare Umgebungslimitierung.
- Minor: einzelne Codec-/Stats-Anomalien.

### RTC-027: Edge

Voraussetzungen:

- Aktuelle stabile Microsoft Edge Version.
- Medienberechtigungen gesetzt.

Schritte:

1. RTC-001 ausfuehren.
2. RTC-004, RTC-005, RTC-011 und RTC-013 ausfuehren.
3. Optional RTC-014, wenn 4K-Quelle vorhanden ist.
4. TURN TCP/TURNS einmal testen, wenn Netzwerkumgebung vorhanden.

Erwartetes Ergebnis:

- Verhalten entspricht weitgehend Chromium.
- Keine Edge-spezifischen Auth-/Media-Fehler.

Metriken:

- Join Time, RTT/Jitter/Paketverlust.
- Kamera-/Screenshare-Aufloesung und FPS.
- ICE Candidate Type.

Bestehensgrenze:

- Audio, Self Mute/Deafen, Kamera 720p und Screenshare 1080p bestehen.

Fehlerklassifikation:

- Critical: Edge kann Voice nicht nutzen.
- Major: Kernmedia bricht trotz Chromium-Paritaet.
- Minor: Edge-spezifische UI-/Permission-Eigenheit.

### RTC-028: Safari, soweit moeglich

Voraussetzungen:

- Aktuelle Safari-Version auf macOS.
- HTTPS oder lokal erlaubte sichere Origin fuer Media APIs.
- Kamera/Mikrofon/Screenshare-Berechtigungen gesetzt.

Schritte:

1. RTC-001 ausfuehren.
2. RTC-004 und RTC-005 ausfuehren.
3. RTC-011 testen.
4. RTC-013 testen, sofern Safari Screen Capture fuer die Umgebung erlaubt.
5. RTC-014 nur als Best-Effort testen und Browserlimitierungen dokumentieren.

Erwartetes Ergebnis:

- Audio funktioniert.
- Kamera funktioniert mindestens 720p, sofern Geraet es erlaubt.
- Screenshare funktioniert soweit Safari es unterstuetzt.
- Nicht unterstuetzte APIs werden sauber dokumentiert und brechen nicht den Rest der App.

Metriken:

- Join Time, Audio RTT/Jitter/Paketverlust.
- Kamera-/Screenshare-Aufloesung/FPS, sofern verfuegbar.
- Console Errors und Permission-Prompts.

Bestehensgrenze:

- Audio muss bestehen.
- Kamera/Screenshare werden als bestanden gewertet, wenn Safari sie fuer die Testumgebung
  unterstuetzt und OpenVoice keinen zusaetzlichen Fehler erzeugt.

Fehlerklassifikation:

- Critical: Safari-Audio ist generell unmoeglich.
- Major: unterstuetzte Safari-Media-APIs brechen OpenVoice.
- Minor: Safari-limitierter 4K-/Screenshare-Support, dokumentiert.

## 4. Abschlussprotokoll

Pro Testlauf festhalten:

- Datum, Tester, Git Commit, Browser-Versionen, OS-Versionen.
- Compose-Konfiguration ohne Secret-Werte.
- LiveKit/coturn Version oder Image Tag.
- Netzwerkprofil: normal, UDP-blockiert, Paketverlust, RTT.
- Ergebnis je Test: pass, fail, blocked, not applicable.
- Gemessene Kernmetriken.
- Fehlerklasse und Link zu Issue/MR, falls fail oder blocked.
- Hinweise zu Browser-/Geraetelimitierungen.

Closed-Beta-Freigabe fuer RTC ist nur sinnvoll, wenn:

- RTC-001 bis RTC-018 auf Chrome/Chromium bestanden sind.
- Firefox und Edge mindestens Audio, Self Mute/Deafen, Kamera 720p und Screenshare 1080p bestehen.
- Safari-Audio bestanden ist oder eine klare, dokumentierte Safari-Einschraenkung vorliegt.
- RTC-019 bis RTC-024 keine Blocker oder Criticals erzeugen.
- Alle Criticals behoben sind und alle Majors explizit triagiert wurden.
