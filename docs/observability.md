# Observability

OpenVoice muss von Anfang an messbar sein. Monitoring ist Teil des MVP.

---

## Metriken

Phase 8 exportiert Prometheus-Metriken über `GET /metrics`. Die API hält die Aggregation
prozesslokal; Prometheus übernimmt Persistenz und Auswertung.

| Metrik                          | Zweck                                  |
| ------------------------------- | -------------------------------------- |
| `gateway_connections`           | aktive WebSocket-Verbindungen          |
| `gateway_disconnects_total`     | Gateway-Verbindungsabbrüche            |
| `messages_sent_total`           | Chat-Durchsatz                         |
| `voice_joins_total`             | Voice-Nutzung                          |
| `voice_join_failures_total`     | Fehler beim Voice Join                 |
| `permission_denied_total`       | verweigerte Aktionen                   |
| `turn_credentials_issued_total` | TURN Credential Nutzung                |
| `sfu_rooms_active`              | aktive SFU-Räume                       |
| `sfu_participants_active`       | aktive SFU-Teilnehmer                  |
| `rtc_relay_ratio`               | TURN Relay Anteil                      |
| `rtc_samples_total`             | Anzahl aktueller RTC-Stats-Samples     |
| `rtc_packet_loss_avg`           | Paketverlust                           |
| `rtc_audio_rtt_p95`             | Audio RTT P95                          |
| `rtc_audio_jitter_avg`          | durchschnittlicher Audio-Jitter        |
| `rtc_audio_concealed_samples_avg` | verdeckte Audio-Samples im Schnitt   |
| `rtc_video_bitrate_avg`         | durchschnittliche Video-Bitrate        |
| `api_http_requests_total`       | HTTP-Antworten nach Methode und Status |
| `api_errors_total`              | API-Fehler nach Code und Status        |

Clients senden WebRTC-Quality-Samples authentifiziert an `POST /api/v1/rtc/stats`. Der Server
prüft `VIEW_CHANNEL`, verwirft nicht sichtbare Channel serverseitig und rechnet nur aggregierte
Fensterwerte in Prometheus-Metriken um.

Health-Endpunkte:

- `GET /healthz`: Prozess lebt.
- `GET /readyz`: PostgreSQL, Valkey und SFU sind erreichbar.

---

## Dashboards

`infra/grafana/dashboards/openvoice-overview.json` wird über Grafana-Provisioning automatisch
geladen. Enthalten sind:

- System Health.
- Voice Quality mit Paketverlust, Audio-RTT und TURN Relay Ratio.
- TURN Usage über Credentials und Relay Ratio.
- SFU Load über aktive Räume und Teilnehmer.
- WebSocket Load.
- Chat Throughput.
- Error Rate.
- Permission Denied Rate.

Prometheus scrapt API, coturn und LiveKit. LiveKit exportiert seine Metrics im Compose-Setup auf
`livekit:6789`; der Host-Port ist standardmaessig nur lokal gebunden. Host- und Container-Metriken
wie Node Exporter oder cAdvisor bleiben optional, sollen fuer groessere Beta-Lasttests aber
ergaenzt werden, damit CPU, UDP-Drops und Netzwerkdurchsatz ausserhalb der App sichtbar werden.

---

## Alerts

`infra/prometheus-alerts.yml` dokumentiert und lädt die Phase-8-Basisregeln.

| Alert                      | Bedingung                               |
| -------------------------- | --------------------------------------- |
| High TURN Relay Ratio      | > 50 % über 15 min                      |
| Audio Packet Loss          | Durchschnitt > 5 % über 10 min          |
| WebSocket Disconnect Spike | > 20 Disconnects in 5 min               |
| Voice Join Failures        | > 2 %                                   |
| API Down                   | `openvoice-api` Scrape nicht erreichbar |
| LiveKit Metrics Down       | `livekit` Scrape nicht erreichbar       |
| No RTC Samples             | Voice Joins ohne RTC-Stats ueber 15 min |

SFU-CPU, DB-Slow-Query- und TURN-Allocation-Alerts bleiben für den produktiven Betrieb offen,
bis die jeweiligen Komponenten konkrete Metriken in der Zielumgebung liefern.
