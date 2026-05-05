# RTC, WebRTC, SFU und coturn

Dieses Dokument enthält die technischen Vorgaben für Audio, Video, Screenshare, SFU und TURN.

---

## 1. Grundsatz

OpenVoice nutzt WebRTC für alle Medien:

- Mikrofon-Audio
- Kamera-Video
- Screenshare
- optional Tab-/System-Audio bei Screenshare

Für Gruppen wird eine SFU verwendet. Kein reines Mesh.

---

## 2. SFU

MVP-Empfehlung:

- LiveKit self-hosted.

Alternative:

- mediasoup.

Die Applikation muss ein internes `MediaProvider` Interface verwenden.

Phase 5 nutzt `LiveKitMediaProvider` für Join-Tokens und serverseitige Teilnehmersteuerung. Das
Interface bleibt schmal, damit LiveKit später durch eine andere Open-Source-SFU ersetzt werden kann.

---

## 3. Audio

Pflichtcodec:

- Opus.

Default Voice Profile:

```ts
{
  channelCount: 1,
  sampleRate: 48000,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  opus: {
    stereo: false,
    dtx: true,
    fec: true,
    ptime: 20,
    maxaveragebitrate: 64000
  }
}
```

Low Latency Profile:

```ts
{
  channelCount: 1,
  sampleRate: 48000,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  opus: {
    stereo: false,
    dtx: false,
    fec: true,
    ptime: 10,
    maxaveragebitrate: 96000
  }
}
```

Music Mode:

```ts
{
  channelCount: 2,
  sampleRate: 48000,
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  opus: {
    stereo: true,
    dtx: false,
    fec: true,
    ptime: 20,
    maxaveragebitrate: 256000
  }
}
```

---

## 4. Screenshare 4K

4K-Profil:

```ts
const screenShare4kConstraints = {
  video: {
    width: { ideal: 3840, max: 3840 },
    height: { ideal: 2160, max: 2160 },
    frameRate: { ideal: 30, max: 60 },
    displaySurface: "monitor"
  },
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false
  }
};
```

4K muss angefragt und ermöglicht werden. Es darf nicht als garantiert dargestellt werden.

---

## 5. Adaptive Strategie

Priorität bei Bandbreitenmangel:

1. Audio stabil halten.
2. Nicht sichtbare Videos pausieren oder niedrig abonnieren.
3. Screenshare bei Detailmodus erst FPS reduzieren.
4. Videoauflösung reduzieren.
5. Bei sehr schlechter Verbindung Kamera deaktivieren oder nur Audio behalten.

---

## 6. coturn

coturn ist Pflichtbestandteil.

Muss:

- Keine anonymen TURN-Zugänge.
- Temporäre REST Credentials.
- UDP TURN.
- TCP TURN Fallback.
- TURNS Fallback.
- Relay-Port-Range dokumentieren.
- Prometheus Metrics verwenden, wenn verfügbar.

TURN Credential Beispiel:

```json
{
  "iceServers": [
    {
      "urls": [
        "stun:turn.example.com:3478",
        "turn:turn.example.com:3478?transport=udp",
        "turn:turn.example.com:3478?transport=tcp",
        "turns:turn.example.com:5349?transport=tcp"
      ],
      "username": "1760000000:user_123",
      "credential": "base64-hmac-password"
    }
  ],
  "ttlSeconds": 1200
}
```

Phase 5 erzeugt diese Credentials ausschließlich serverseitig über `/api/v1/turn/credentials` und
die Voice-Join-Response. Das gemeinsame `TURN_SHARED_SECRET` wird nie an den Browser gesendet.

---

## 7. RTC Stats

Der Client muss WebRTC Stats sammeln und aggregiert melden:

- RTT
- Jitter
- Paketverlust
- Bitrate
- Frames dropped
- Auflösung
- FPS
- ICE Candidate Type
- Transportprotokoll
- Relay ja/nein

Der Phase-5-Webclient sammelt zunächst lokale Audio-Sender-Stats, Teilnehmerzahl und aktive
Speaker-Anzahl. Aggregierte Uploads und Dashboards bleiben Observability-Folgearbeit.

Diese Daten dienen:

- Qualitätsanzeige im Client.
- Debugging.
- Prometheus/Grafana Dashboards.
- Alerting.

---

## 8. Quellen

- WebRTC: https://www.w3.org/TR/webrtc/
- Screen Capture: https://www.w3.org/TR/screen-capture/
- WebRTC Stats: https://www.w3.org/TR/webrtc-stats/
- coturn: https://github.com/coturn/coturn
- coturn Manpage: https://www.mankier.com/1/turnserver
- Opus RTP RFC 7587: https://www.rfc-editor.org/rfc/rfc7587.txt
