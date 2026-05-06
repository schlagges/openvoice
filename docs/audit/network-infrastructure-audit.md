# OpenVoice Network Infrastructure Audit

Datum: 2026-05-06

Lokaler Commit: `f7ed813`

Scope: Prod (`https://voice.schnick-schnack.info`) und lokale/Compose-nahe Konfiguration. Ziel war
eine nicht-invasive Analyse von Netzwerkpfaden, RTC-Stabilitaet, Datendurchsatz, Latenzrisiken,
TURN/SFU-Fallbacks und Observability. Es wurden keine Laufzeitkonfigurationen geaendert.

## Kurzfazit

Die Basis ist erreichbar: Web, API, Readiness, Prometheus, Grafana, LiveKit und coturn laufen. Die
aktuelle RTC-Stabilitaet haengt aber stark am direkten LiveKit-UDP-Pfad. Die wichtigsten Risiken
sind ein defekter TURNS-Fallback, coturn-Relay-Probleme mit Docker-Privatadressen, haeufige
LiveKit-ICE-Pair-Wechsel und unzureichende Audio-/Netzwerk-Metriken fuer belastbare Ursachenanalyse.

## Gepruefte Umgebung

| Bereich | Ergebnis |
| --- | --- |
| DNS | `voice.schnick-schnack.info` zeigt auf `217.160.175.231`. |
| HTTPS | `443/tcp` erreichbar, TLS 1.3, Zertifikat fuer `voice.schnick-schnack.info`, Verifikation OK. |
| Web | `GET /` liefert `200`. |
| API | `GET /api/v1/me` liefert ohne Session erwarteten App-`401`. |
| Security Headers | CSP, HSTS, Frame-Schutz, Referrer-Policy, Permissions-Policy vorhanden. |
| LiveKit HTTP Smoke | `GET /livekit/` liefert `200 OK` mit Body `OK`. Das weicht von der Deployment-Doku ab, die fuer den Smoke eher `401` erwartet. |
| Docker Stack | `infra-web-1`, `infra-api-1`, `infra-livekit-1`, `infra-coturn-1`, `infra-prometheus-1`, `infra-grafana-1`, Postgres und Valkey laufen. |
| Readiness | API `readyz` meldet Postgres, Valkey und LiveKit `ok`. |
| Prometheus Targets | `openvoice-api` und `coturn` sind `up`. |
| Aktive SFU-Last | Prometheus meldete 1 Raum und 2 aktive SFU-Teilnehmer. |

## Port- und Routing-Befunde

| Port | Erwartung | Beobachtung |
| --- | --- | --- |
| `443/tcp` | Web/API/WSS via Host-Nginx | Erreichbar. |
| `3478/tcp` | TURN TCP | Erreichbar. |
| `3478/udp` | STUN/TURN UDP | Auf Host gemappt; externer UDP-Erfolg wurde in diesem Audit nicht aktiv validiert. |
| `5349/tcp` | TURNS | Externer TCP-Connect auf `voice.schnick-schnack.info:5349` wurde mit `connection refused` beendet. |
| `5349/udp` | TURN DTLS/TURNS UDP, falls genutzt | Auf Host gemappt; externer UDP-Erfolg wurde nicht aktiv validiert. |
| `7881/tcp` | LiveKit RTC TCP Fallback | Erreichbar. |
| `50000-50100/udp` | LiveKit RTC UDP | Auf Host gemappt. Range ist fuer 20+ Nutzer mit Video/Screenshare knapp. |
| `49152-49200/udp` | coturn Relay | Auf Host gemappt. Range ist fuer Beta-/Lasttests knapp. |

## Observability-Snapshot

Prometheus-Werte zum Auditzeitpunkt:

| Metrik | Wert | Einordnung |
| --- | ---: | --- |
| `voice_joins_total` | 30 | Voice Join wird genutzt. |
| `voice_join_failures_total` | 0 | Join-API meldet keine Fehler. |
| `turn_credentials_issued_total` | 30 | TURN Credentials werden ausgegeben. |
| `sfu_rooms_active` | 1 | Aktiver Raum vorhanden. |
| `sfu_participants_active` | 2 | Zwei Teilnehmer aktiv. |
| `rtc_relay_ratio` | 0 | Keine gemeldete Relay-Nutzung, trotz coturn-Fehlern. |
| `rtc_packet_loss_avg` | 0 | Nicht belastbar als Qualitaetsnachweis. |
| `rtc_audio_rtt_p95` | 0 | Nicht belastbar als Qualitaetsnachweis. |
| `rtc_video_bitrate_avg` | ca. 1.55 Mbit/s | Video-Stats kommen an. |
| `gateway_connections` | 0 | Gateway-Metrik bildet aktive Browser-/RTC-Nutzung nicht sichtbar ab. |

## Findings

### P1-NET-001: TURNS-Fallback ist oeffentlich nicht nutzbar

**Evidenz:**

- `tcp/5349` war von extern nicht erreichbar (`connection refused`).
- `openssl s_client -connect voice.schnick-schnack.info:5349` konnte keine TLS-Verbindung
  aufbauen.
- Der laufende coturn-Container bindet `/etc/coturn/certs` aus
  `/home/schlagges/projects/openvoice-release-f5da2d6/infra/certs`; dort ist im Container nur
  `.gitkeep` sichtbar.
- coturn-Logs enthalten Zertifikatswarnungen fuer `localhost.pem` und `localhost-key.pem`.

**Risiko:** Nutzer in restriktiven Netzen verlieren den sicheren TLS/TCP-Fallback. Das widerspricht
dem RTC-/Deployment-Ziel fuer TURN UDP, TURN TCP und TURNS.

**Naechste Aktion:** coturn-Zertifikatspfad und Release-Mount korrigieren, echtes Zertifikat fuer
`voice.schnick-schnack.info` bereitstellen oder dokumentiert einbinden, danach TURNS extern mit
TLS-Handshake testen.

### P1-NET-002: coturn-Relay kollidiert mit Docker-Privatadressen

**Evidenz:**

- coturn entdeckt Relay-Adressen `172.19.0.3` und `::1`.
- coturn-Logs enthalten wiederholt `A peer IP 172.19.0.3 denied in the range: 172.16.0.0-172.31.255.255`.
- Private Zielnetze sind sinnvollerweise via `denied-peer-ip` blockiert, aber der aktuelle
  Docker-/TURN-Pfad versucht offenbar genau eine solche private Adresse zu nutzen.

**Risiko:** TURN-Relay-Pfade koennen scheitern, obwohl Credentials ausgegeben werden. Nutzer mit
NAT-/Firewall-Einschraenkungen bekommen dann `could not establish pc connection` oder einseitige
Medienprobleme.

**Naechste Aktion:** coturn `external-ip`, `relay-ip`/`listening-ip`, Docker-Netzpfad und LiveKit
ICE-Kandidaten gemeinsam validieren. Ziel ist, dass TURN-Relays keine privaten Docker-Peers fuer
Browser-Medienpfade benoetigen.

### P1-NET-003: LiveKit zeigt haeufige ICE-Pair-Wechsel eines Publishers

**Evidenz:**

- LiveKit-Logs zeigen ueber mehrere Sekunden wiederholt `ice reconnected or switched pair` fuer
  denselben Publisher.
- Lokaler LiveKit-Kandidat ist `udp host 217.160.175.231:50002`, Remote-Kandidat ist `prflx` mit
  wechselnden Ports.

**Risiko:** Das kann Audio-Aussetzer, Refresh-Probleme oder instabile Medienpfade erklaeren. Ohne
korrelierte Client-Stats bleibt offen, ob es am Client-Netz, NAT-Rebinding, ICE-Konfiguration oder
Port-/Firewall-Verhalten liegt.

**Naechste Aktion:** Beim naechsten 2-Nutzer-Test Client-RTC-Stats, LiveKit-Logs und Prometheus-Zeit
parallel erfassen. Bei Reproduktion UDP-Fallback, TCP-Fallback und TURN-Fallback getrennt testen.

### P1-NET-004: UDP-/Relay-Portbereiche sind fuer Beta-Lasttests knapp dimensioniert

**Evidenz:**

- LiveKit RTC UDP Range ist `50000-50100`.
- coturn Relay Range ist `49152-49200`.
- Lastenheft und QA-Plan enthalten Tests mit 20 Nutzern, Kamera und 4K-Screenshare.

**Risiko:** Kleine Portbereiche koennen bei mehreren Teilnehmern, parallelen Tracks, Reconnects
und TURN-Relays zu Ressourcenknappheit fuehren. Das gefaehrdet Durchsatz- und Stabilitaetstests.

**Naechste Aktion:** Fuer Closed-Beta-Zielgroesse Portbedarf abschaetzen und groessere, dokumentierte
UDP-Ranges samt Firewall/Provider-Regeln definieren.

### P1-OBS-001: Audio-/Netzwerk-Metriken sind nicht aussagekraeftig genug

**Evidenz:**

- Trotz aktiver Voice-Nutzung und 30 Join-/TURN-Credential-Zaehlungen stehen
  `rtc_audio_rtt_p95`, `rtc_packet_loss_avg` und `rtc_relay_ratio` auf `0`.
- Video-Bitrate wird gemeldet, Audioqualitaetswerte aber nicht sichtbar belastbar.
- `gateway_connections` steht auf `0`, obwohl Browser- und Voice-Aktivitaet stattfand.

**Risiko:** Audio-Probleme lassen sich nicht zielgerichtet diagnostizieren. Performance-Ziele aus
dem Lastenheft koennen nicht belastbar nachgewiesen werden.

**Naechste Aktion:** Client-Stats fuer lokale und remote Audio-Tracks verifizieren, fehlende
Receiver-Stats erfassen, Prometheus-Dashboard um Audio-RTT/Jitter/Concealed-Samples/Relay-Nutzung
mit nicht-null Plausibilitaetschecks erweitern.

### P2-OBS-002: LiveKit- und Host-Metriken fehlen im Prometheus-Scrape

**Evidenz:**

- Prometheus scrapt aktuell `openvoice-api` und `coturn`.
- Kein LiveKit-Metrics-Target und keine Host-/Container-Metriken wie Node Exporter oder cAdvisor
  sichtbar.

**Risiko:** SFU-CPU, Netzwerkdurchsatz, UDP-Drops, Container-Ressourcen und Host-Saettigung sind
nicht sichtbar. Optimierung von Durchsatz und Latenz bleibt dadurch unvollstaendig.

**Naechste Aktion:** LiveKit-Metrics, Node Exporter und optional cAdvisor als separates Monitoring-
Issue planen und Dashboards/Alerts ergaenzen.

### P2-DEP-001: Deployment-Stand und Runtime-Pfade driften auseinander

**Evidenz:**

- Der laufende coturn-Container bindet aus `/home/schlagges/projects/openvoice-release-f5da2d6`.
- Der bekannte Source-Pfad `/home/schlagges/projects/openvoice` ist auf `main` hinter `origin/main`
  und stark dirty.
- Aktive Container nutzen `openvoice-api:0.1.0-rc1` und `openvoice-web:0.1.0-rc1`, waehrend neuere
  GitLab-Registry-Images auf dem Host existieren.

**Risiko:** Fehleranalyse und Deployments werden unklar, weil nicht offensichtlich ist, welche
Konfiguration und welche Artefakte wirklich aktiv sind.

**Naechste Aktion:** Ein eindeutiges Release-Verzeichnis, Image-Tags, Compose-Dateien und Rollback-
Runbook definieren. Mount-Pfade fuer Zertifikate und Grafana muessen aus dem aktiven Release-Pfad
kommen.

### P2-DOC-001: LiveKit-Smoke-Check in Deployment-Doku ist ungenau

**Evidenz:**

- `curl -i https://voice.schnick-schnack.info/livekit/` liefert `200 OK`.
- `docs/deployment.md` erwartet fuer `/livekit/` ohne Token typischerweise `401`.

**Risiko:** Betreiber koennen einen funktionierenden oder defekten LiveKit-Proxy falsch bewerten.

**Naechste Aktion:** Smoke-Check auf einen Endpunkt anpassen, der den Signalpfad ohne Token
eindeutig validiert, oder die erwartete `OK`-Antwort dokumentieren.

## Issue-Aufteilung

| Finding | Empfohlenes Issue |
| --- | --- |
| P1-NET-001 | GitLab #8: `[P1][TURN] TURNS-Fallback auf 5349 ist nicht nutzbar` |
| P1-NET-002 | GitLab #9: `[P1][TURN] coturn-Relay scheitert an Docker-Privatadressen` |
| P1-NET-003 | GitLab #10: `[P1][LiveKit] ICE-Pair-Wechsel bei Publishern untersuchen` |
| P1-NET-004 | GitLab #11: `[P1][RTC] UDP- und Relay-Portbereiche fuer Beta-Lasttests dimensionieren` |
| P1-OBS-001 | GitLab #12: `[P1][Observability] Audio-/RTC-Metriken liefern keine belastbaren Werte` |
| P2-OBS-002 | GitLab #13: `[P2][Observability] LiveKit- und Host-Metriken in Prometheus ergaenzen` |
| P2-DEP-001 | GitLab #14: `[P2][Deployment] Runtime-Pfade und Image-Stand vereinheitlichen` |
| P2-DOC-001 | GitLab #15: `[P2][Docs] LiveKit-Smoke-Check korrigieren` |

## MR-Fix-Status

| Issue | Status im MR |
| --- | --- |
| #8 | `infra/docker-compose.prod.yml` verlangt jetzt explizit `TURN_CERT_MOUNT`, `TURN_CERT_FILE` und `TURN_PRIVATE_KEY_FILE`; `docs/deployment.md` dokumentiert den Let's-Encrypt-Mount und den externen TURNS-Smoke. |
| #9 | Die TURN-/LiveKit-Produktionskonfiguration trennt Relay- und SFU-Portbereiche und dokumentiert, dass LiveKit nur oeffentliche Kandidaten signalisieren darf; private Docker-Kandidaten bleiben blockiert. |
| #10 | Client-RTC-Stats enthalten jetzt RTT aus dem ausgewaehlten ICE-Candidate-Pair als Fallback, damit ICE-Pair-Wechsel mit messbaren RTC-Daten korreliert werden koennen. |
| #11 | Produktionsdefaults erweitern LiveKit auf `50000-51000/udp` und coturn auf `49152-49999/udp`; die passenden Start-/End-Variablen sind dokumentiert. |
| #12 | API-/Client-Stats erfassen zusaetzlich `connection.rttMs`; Prometheus exportiert `rtc_samples_total`, `rtc_audio_jitter_avg` und `rtc_audio_concealed_samples_avg`. |
| #13 | LiveKit exportiert im Compose-Setup Metrics auf `6789`; Prometheus scrapt `livekit:6789`; Grafana zeigt LiveKit Health und weitere RTC/TURN-Werte. |
| #14 | Deployment-Doku verlangt einen einzigen aktiven Release-Pfad und explizite Host-Mounts fuer Zertifikate; alte `openvoice-release-*` Mounts sind als Drift-Risiko markiert. |
| #15 | Der LiveKit-Smoke-Check ist korrigiert: `/livekit/` darf `200 OK` liefern; der TURNS-Smoke wurde ergaenzt. |

## Ausgefuehrte Checks

- `dig +short voice.schnick-schnack.info`
- `curl -I https://voice.schnick-schnack.info`
- `curl -i https://voice.schnick-schnack.info/api/v1/me`
- `curl -i https://voice.schnick-schnack.info/livekit/`
- TCP-Smoke fuer `443`, `3478`, `5349`, `7881`
- TLS-Smoke fuer `443` und `5349`
- Host: `docker ps`
- Host: `docker compose ... ps`
- Host: API `readyz`
- Host: Prometheus `/api/v1/targets`
- Host: coturn `/metrics`
- Host: OpenVoice API `/metrics`
- Host: Grafana `/api/health`
- Host: gefilterte API-/LiveKit-/coturn-Logs ohne Secrets
- Host: Portlistener via `ss`
- Host: coturn-Zertifikat-Mounts via `docker inspect` und Container-Dateiliste
