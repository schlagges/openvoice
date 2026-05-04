# Architektur OpenVoice

Dieses Dokument fasst die Zielarchitektur für Codex zusammen. Das ausführliche Lastenheft liegt in `docs/lastenheft.md`.

---

## 1. Kernprinzipien

- Browser-first.
- WebRTC für Audio, Video und Screenshare.
- SFU statt Peer-to-Peer-Mesh.
- coturn als Pflichtbestandteil.
- Keine proprietären RTC-SaaS-Dienste.
- Rechteprüfung immer im Backend.
- Audioqualität und Latenz haben Vorrang vor Videoqualität.
- 4K ist ein adaptives Qualitätsprofil, keine harte Garantie.

---

## 2. Zielarchitektur

```text
Browser Client
  |
  | HTTPS / WSS
  v
Reverse Proxy
  |
  +--> Web Frontend
  +--> API Backend
          |
          +--> PostgreSQL
          +--> Redis/Valkey
          +--> SFU Control API
          +--> coturn Credential Service

Browser Client <---- WebRTC Media ----> SFU
Browser Client <---- ICE/STUN/TURN ----> coturn
```

---

## 3. Komponenten

| Komponente | Aufgabe |
|---|---|
| `apps/web` | Browser-App, UI, WebRTC Client, Chat, Channelbaum |
| `apps/api` | Auth, Workspace, Rollen, Rechte, Chat, Gateway, Voice Tokens |
| `packages/shared` | Gemeinsame Typen, Events, Permission-Bits, Schemas |
| PostgreSQL | Persistente Daten |
| Redis/Valkey | PubSub, Presence, Rate Limits, temporäre Zustände |
| LiveKit/mediasoup | SFU für Audio/Video/Screenshare |
| coturn | STUN/TURN für NAT/Fallback |
| Prometheus | Metriken |
| Grafana | Dashboards |

---

## 4. Media Provider Interface

Die Anwendung darf nicht direkt an LiveKit gekoppelt werden. Die Integration muss über ein internes Interface laufen.

```ts
export interface MediaProvider {
  createRoom(input: CreateRoomInput): Promise<MediaRoom>;
  deleteRoom(roomId: string): Promise<void>;
  createJoinToken(input: CreateJoinTokenInput): Promise<MediaJoinToken>;
  removeParticipant(input: RemoveParticipantInput): Promise<void>;
  muteParticipant(input: MuteParticipantInput): Promise<void>;
  getRoomStats(roomId: string): Promise<MediaRoomStats>;
}
```

MVP-Empfehlung:

- LiveKit als erster Provider.
- mediasoup später möglich.

---

## 5. Domain Module

Empfohlene Backend-Struktur:

```text
apps/api/src/modules/
  auth/
  users/
  workspaces/
  channels/
  permissions/
  messages/
  voice/
  media/
  turn/
  gateway/
  audit/
```

Regel:

- Controller nehmen Requests entgegen.
- Services enthalten Use Cases.
- Repositories sprechen mit DB.
- Permission Engine ist zentral.
- Audit Writer ist zentral.

---

## 6. Realtime Events

Gateway über WebSocket:

```text
Client -> HELLO/IDENTIFY
Server -> READY
Client -> HEARTBEAT
Server -> DISPATCH Events
```

Events müssen Workspace- und Channel-Rechte berücksichtigen. Ein Nutzer darf keine Events aus Channels erhalten, die er nicht sehen darf.

---

## 7. Datenfluss Voice Join

```text
Client klickt Voice Channel
  -> POST /api/v1/voice/channels/:channelId/join
  -> Backend prüft Permission
  -> Backend erstellt/holt SFU Room
  -> Backend erstellt Media Join Token
  -> Backend erstellt TURN Credentials
  -> Client verbindet zur SFU
  -> Gateway broadcastet VOICE_STATE_UPDATE
```

---

## 8. Skalierung

MVP:

- Ein API-Cluster.
- Eine PostgreSQL-Instanz.
- Redis/Valkey als PubSub.
- Eine oder mehrere SFU Nodes.
- coturn mindestens einmal, später redundant.

Später:

- Regionale SFUs.
- Geo-Routing.
- SFU-Drain bei Wartung.
- Sharding für große Installationen.

---

## 9. Sicherheitsgrenzen

| Grenze | Sicherheitsregel |
|---|---|
| Browser | Kein Vertrauen, nur UI-Komfort |
| API | Autorität für Auth, Rechte, Daten |
| SFU | Darf nur Tokens vom Backend akzeptieren |
| coturn | Nur kurzlebige Credentials |
| DB | Keine Klartext-Secrets |

---

## 10. Offene Architekturentscheidungen

Diese Entscheidungen müssen in der jeweiligen Phase getroffen und dokumentiert werden:

- React oder Svelte.
- Node.js/TypeScript oder Go Backend.
- LiveKit zuerst oder mediasoup zuerst.
- ORM/Query Builder.
- Redis oder Valkey Image.
- AGPL vs Apache/MIT Lizenz.
