# Observability

OpenVoice muss von Anfang an messbar sein. Monitoring ist Teil des MVP.

---

## Metriken

| Metrik | Zweck |
|---|---|
| `gateway_connections` | aktive WebSocket-Verbindungen |
| `messages_sent_total` | Chat-Durchsatz |
| `voice_joins_total` | Voice-Nutzung |
| `voice_join_failures_total` | Fehler beim Voice Join |
| `permission_denied_total` | verweigerte Aktionen |
| `turn_credentials_issued_total` | TURN Credential Nutzung |
| `sfu_rooms_active` | aktive SFU-Räume |
| `sfu_participants_active` | aktive SFU-Teilnehmer |
| `rtc_relay_ratio` | TURN Relay Anteil |
| `rtc_packet_loss_avg` | Paketverlust |
| `rtc_audio_rtt_p95` | Audio RTT P95 |

---

## Dashboards

- System Health.
- Voice Quality.
- TURN Usage.
- SFU Load.
- WebSocket Load.
- Chat Throughput.
- Error Rate.
- Permission Denied Rate.

---

## Alerts

| Alert | Bedingung |
|---|---|
| High TURN Relay Ratio | > 50 % über 15 min |
| Audio Packet Loss | P95 > 5 % über 10 min |
| SFU CPU High | > 85 % über 10 min |
| WebSocket Disconnect Spike | > 3× baseline |
| DB Slow Queries | P95 > 250 ms |
| TURN Allocation Failures | > 5 % |
| Voice Join Failures | > 2 % |
