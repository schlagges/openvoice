# Lastenheft OpenVoice

Dieses Dokument ist die verbindliche Produkt- und technische Spezifikation für **OpenVoice**.

Codex muss dieses Dokument bei Architektur-, API-, Datenmodell-, Rechte-, Voice-, Video-, TURN- und Deployment-Entscheidungen berücksichtigen.

Wenn eine Implementierungsentscheidung vom Lastenheft abweicht, muss die Abweichung begründet und im passenden Dokument unter `docs/` festgehalten werden.

---

## 1. Projektübersicht

**Arbeitstitel:** OpenVoice  
**Produktart:** Browserbasiertes Voice-/Chat-/Video-Tool ähnlich Discord  
**Primäres Ziel:** Schlankes, schnelles, self-hostbares Kommunikationssystem mit sehr niedriger Latenz, sehr guter Audioqualität, 4K-Screenshare und starkem Rechtekonzept.  
**Sekundäres Ziel:** Technisch saubere Open-Source-Basis, die Codex schrittweise implementieren kann.

OpenVoice soll keine vollgestopfte Social-Plattform werden. Das Produkt konzentriert sich auf:

- Textchat
- Voice Channels
- Kamera-Video
- Screen-/Video-Sharing bis 4K
- Baumstruktur für Channels
- Rollen- und Rechteverwaltung
- Moderation
- stabile WebRTC-Verbindungen
- komplette Self-Hosting-Fähigkeit

---

## 2. Grundentscheidung

Das System **MUSS** browserbasiert sein und Audio/Video/Screenshare über **WebRTC** abwickeln.

Für Gruppenkommunikation **MUSS** eine **SFU-Architektur** genutzt werden, nicht reines Peer-to-Peer-Mesh. Bei mehreren Teilnehmern und 4K-Streams wäre Mesh zu teuer, weil jeder Client an jeden anderen Client senden müsste. Eine SFU empfängt Streams und leitet sie selektiv weiter.

Als Open-Source-Mediaserver kommen insbesondere in Frage:

- **LiveKit self-hosted** für schnelle MVP-Umsetzung
- **mediasoup** für maximale Kontrolle

Für NAT-/Firewall-Durchdringung **MUSS** ein eigener **coturn**-Dienst betrieben werden. coturn ist eine freie Open-Source-Implementierung von STUN/TURN und für VoIP/WebRTC-NAT-Traversal geeignet.

Screen-Sharing **MUSS** über die Browser Screen Capture API beziehungsweise `getDisplayMedia()` erfolgen.

---

## 3. Zielbild

Der Nutzerfluss im Zielsystem:

1. Nutzer öffnet die Web-App im Browser.
2. Nutzer meldet sich an.
3. Nutzer betritt einen Workspace.
4. Links befindet sich eine Baumstruktur aus Kategorien und Channels.
5. Channels können Text-, Voice- oder kombinierte Voice/Text-Channels sein.
6. Nutzer können Voice-Channels betreten.
7. Im Voice-Channel können sie:
   - sprechen,
   - zuhören,
   - Kamera aktivieren,
   - Bildschirm/Fenster/Tab teilen,
   - 4K-Stream senden, sofern Gerät, Browser, Quelle und Netzwerk das erlauben.
8. Chat-Nachrichten sind persistent.
9. Audio/Video ist nicht persistent, außer eine spätere explizite Recording-Funktion wird gebaut.
10. Rechte steuern exakt, wer Channels sehen, schreiben, betreten, sprechen, streamen, moderieren und verwalten darf.

---

## 4. Nicht-Ziele für MVP

Folgende Dinge gehören **nicht** zum MVP:

| Feature | Status |
|---|---|
| Sticker | Nicht im MVP |
| GIF-Suche | Nicht im MVP |
| Bots | Nicht im MVP |
| App-Store/Integrationen | Nicht im MVP |
| Nitro-/Payment-System | Nicht im MVP |
| Spiele-Overlay | Nicht im MVP |
| Native Desktop App | Nicht im MVP |
| Mobile Native Apps | Nicht im MVP |
| Public Discovery | Nicht im MVP |
| Streaming zu Twitch/YouTube | Nicht im MVP |
| Foren/Threads | Nicht im MVP |
| Komplexe Profile | Nicht im MVP |
| Serverweite Emojis | Nicht im MVP |
| Recording | Nicht im MVP |
| KI-Features | Nicht im MVP |

---

## 5. Begriffe

| Begriff | Bedeutung |
|---|---|
| User | Globales Benutzerkonto. |
| Workspace | Discord-ähnlicher Server. |
| Member | User innerhalb eines Workspaces. |
| Role | Rolle innerhalb eines Workspaces. |
| Permission | Einzelnes Recht, z. B. `SEND_MESSAGES`. |
| Channel Node | Ein Knoten im Channel-Baum. Kann Kategorie oder Channel sein. |
| Category | Container-Knoten ohne eigene Chat-/Voice-Funktion. |
| Text Channel | Persistenter Chatraum. |
| Voice Channel | Realtime-Raum für Audio, Video und Screenshare. |
| Combined Channel | Voice-Channel mit zugehörigem Textchat. |
| SFU | Selective Forwarding Unit für WebRTC-Medienweiterleitung. |
| STUN | Hilft Clients, öffentliche Adresse/Port zu erkennen. |
| TURN | Relay für Medienverkehr, wenn direkte Verbindung nicht klappt. |
| ICE | WebRTC-Verbindungsaufbauverfahren zur Auswahl des besten Pfads. |
| E2EE | Ende-zu-Ende-Verschlüsselung zwischen Clients. |
| PTT | Push-to-Talk. |
| VAD | Voice Activity Detection. |
| RTC Stats | Browserstatistiken zur WebRTC-Verbindungsqualität. |

---

## 6. Prioritäten

### 6.1 Muss-Ziele

| Ziel | Beschreibung |
|---|---|
| Browserfähig | Keine Desktop-App notwendig. |
| Open Source | Kein proprietärer SaaS-Zwang. |
| Ultra niedrige Latenz | Audio/Video müssen auf Echtzeit optimiert sein. |
| Beste Audioqualität | Opus Fullband, niedrige Paketzeiten, gute Geräteauswahl, optional Music Mode. |
| 4K-Streaming | Screen/Kamera bis 3840×2160, adaptiv und hardwareabhängig. |
| Rechtekonzept | Rollen, Vererbung, Overrides, Admin-Bypass. |
| Baumstruktur | Kategorien und Channels verschachtelbar, mit Sortierung. |
| Stabiler NAT-Betrieb | Eigener coturn-Server mit zeitlich begrenzten Credentials. |
| Moderation | Kick, Ban, Timeout, Mute, Move, Audit-Log. |
| Monitoring | WebRTC-Stats, Server-Metriken, TURN-Metriken. |

### 6.2 Soll-Ziele

| Ziel | Beschreibung |
|---|---|
| E2EE optional | Optional für Medien über WebRTC Encoded Transform/SFrame. |
| Mehrere SFU-Regionen | Später für geografisch niedrige Latenz. |
| PWA | Installierbare Web-App. |
| Gastzugang | Einladungsbasierte Gäste ohne volles Konto. |
| Desktop Notifications | Nur Browser Notifications, keine eigene App. |

### 6.3 Kann-Ziele

| Ziel | Beschreibung |
|---|---|
| File Upload | Später, nicht MVP. |
| DMs | Später möglich. |
| Mobile Optimierung | Responsive Layout, native Apps später. |
| Recording | Später, mit separaten Datenschutzanforderungen. |
| Federation | Später, nicht MVP. |

---

## 7. Qualitätsziele

### 7.1 Latenzziele

Diese Werte gelten als **Akzeptanzziele unter definierten Testbedingungen**: gleiche Region, RTT Client↔SFU ≤ 50 ms, Paketverlust ≤ 1 %, Jitter ≤ 20 ms, ausreichend Bandbreite.

| Bereich | Ziel |
|---|---|
| Audio Mouth-to-Ear P50 | ≤ 80 ms |
| Audio Mouth-to-Ear P95 | ≤ 150 ms |
| Audio Join Time P95 | ≤ 2,0 s |
| Voice State Event P95 | ≤ 250 ms |
| Chat Delivery P95 | ≤ 500 ms |
| 1080p Screen Glass-to-Glass P95 | ≤ 500 ms |
| 4K Screen Glass-to-Glass P95 | ≤ 700 ms |
| Reconnect nach Netzwechsel P95 | ≤ 5 s |
| Mute/Unmute Feedback lokal | ≤ 50 ms |
| Mute/Unmute sichtbar für andere P95 | ≤ 250 ms |

### 7.2 Audioziele

Opus ist Pflichtcodec für Audio.

| Modus | Vorgabe |
|---|---|
| Voice Default | Opus, 48 kHz, mono, 20 ms Packetization, DTX optional |
| Low Latency | Opus, 48 kHz, mono, 10 ms Packetization, FEC an |
| Music Mode | Opus, 48 kHz, stereo, höherer Bitrate-Korridor, DTX aus |
| Echo Cancellation | Standard an, pro Nutzer abschaltbar |
| Noise Suppression | Standard an, pro Nutzer abschaltbar |
| Auto Gain Control | Standard an, pro Nutzer abschaltbar |
| Push-to-Talk | Muss |
| Voice Activity | Muss |
| Input Device Selection | Muss |
| Output Device Selection | Soll, soweit Browser unterstützt |

### 7.3 Videoziele

| Modus | Ziel |
|---|---|
| Kamera Default | 720p30 |
| Kamera HD | 1080p30/60 |
| Kamera Ultra | 4K30, wenn Gerät/Browser/Netzwerk geeignet |
| Screenshare Default | 1080p30 |
| Screenshare Detail | 1440p30 |
| Screenshare 4K | 3840×2160, 30 fps Pflichtziel, 60 fps Kann-Ziel |
| Thumbnails | adaptive Niedrigauflösung |
| Ausgewählter Stream | höchste verfügbare Qualität |
| Nicht sichtbare Streams | pausieren oder niedrigste Schicht abonnieren |

4K darf **nicht hart garantiert** werden, weil Browser, Capture-Quelle, Display, GPU, Encoder, Codec, Netzwerk und Empfängergerät entscheidend sind. Das Produkt **MUSS** 4K anfordern, ermöglichen, messen und bei Überlast sauber degradieren.

---

## 8. Open-Source-Anforderungen

### 8.1 Lizenzanforderung

Das gesamte System **MUSS** ohne proprietäre Cloud-Dienste lauffähig sein.

**MUSS:**

- Quellcode vollständig verfügbar.
- Alle Kernkomponenten selbst hostbar.
- Keine Abhängigkeit von Discord, Twilio, Agora, Daily, Zoom, Teams, Google Meet oder proprietären RTC-SaaS.
- OSI-kompatible Lizenzen für Dependencies.
- Eigener Projektcode standardmäßig unter AGPL-3.0-or-later, sofern nicht ausdrücklich permissive Lizenz gewünscht ist.
- Für permissive Variante: Apache-2.0 oder MIT.
- `THIRD_PARTY_NOTICES.md` muss generiert werden.
- Dependency-Lizenzen müssen in CI geprüft werden.

### 8.2 Erlaubte Open-Source-Komponenten

| Bereich | Empfohlen |
|---|---|
| Web Frontend | TypeScript, React oder Svelte |
| Backend | TypeScript/Node.js oder Go |
| Datenbank | PostgreSQL |
| Cache/PubSub | Redis-kompatibel, bevorzugt Valkey oder Redis OSS-kompatibel |
| SFU | LiveKit self-hosted oder mediasoup |
| STUN/TURN | coturn |
| Reverse Proxy | Caddy, nginx oder Traefik |
| Metrics | Prometheus |
| Dashboards | Grafana |
| Logs | Loki oder OpenSearch |
| Tests | Playwright, Vitest/Jest, k6 |
| Container | Docker, Docker Compose |
| Orchestrierung | Kubernetes optional |

---

## 9. Referenzarchitektur

```text
Browser Client
  |
  | HTTPS / WSS
  v
App Backend / API / Signaling
  |        |         |
  |        |         +--> PostgreSQL
  |        |
  |        +--> Redis/Valkey PubSub
  |
  +--> SFU Control API
           |
           v
        LiveKit oder mediasoup SFU
           ^
           |
Browser Client <---- WebRTC Media ----> SFU
           |
           v
        coturn STUN/TURN
```

### 9.1 Komponenten

| Komponente | Aufgabe |
|---|---|
| Browser Client | UI, Gerätezugriff, WebRTC-Verbindung, Chat, Channelbaum |
| App Backend | Auth, Workspaces, Rechte, Channels, Chat, Audit, Tokens |
| Signaling/Gateway | WebSocket für Presence, Chat Events, Voice State, SFU-Tokens |
| SFU | Audio/Video/Screenshare weiterleiten |
| coturn | STUN/TURN für NAT/Firewall-Fälle |
| PostgreSQL | Persistente Daten |
| Redis/Valkey | PubSub, Presence, Rate Limits, temporäre Zustände |
| Prometheus | Metriken |
| Grafana | Dashboards |
| Reverse Proxy | TLS, Routing, Compression, Security Header |

### 9.2 Entscheidung: LiveKit oder mediasoup

**Empfohlene MVP-Variante:** LiveKit self-hosted.

Begründung:

- schnellere Umsetzung,
- fertige WebRTC-Rooms,
- JWT-basierte Auth,
- produktionsnahe SFU,
- weniger Medienserver-Code selbst zu schreiben.

**Alternative für maximale Kontrolle:** mediasoup.

Begründung:

- sehr low-level,
- signaling-agnostisch,
- direkte Kontrolle über Transports, Producers, Consumers,
- gut, wenn das Produkt langfristig eine eigene Medienlogik benötigt.

**Vorgabe:** Die App-Domainlogik darf nicht an einen Anbieter gekoppelt werden. Es muss eine interne Media-Abstraktion geben:

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

---

## 10. Browseranforderungen

### 10.1 Unterstützte Browser

| Browser | Mindestziel |
|---|---|
| Chrome / Chromium | aktuelle stabile Version |
| Edge | aktuelle stabile Version |
| Firefox | aktuelle stabile Version |
| Safari macOS | aktuelle stabile Version, soweit WebRTC-Funktionen verfügbar |
| Mobile Safari / Chrome Android | responsive Basisnutzung, aber keine 4K-Garantie |

### 10.2 Browser-APIs

| API | Nutzung |
|---|---|
| `navigator.mediaDevices.getUserMedia()` | Mikrofon/Kamera |
| `navigator.mediaDevices.getDisplayMedia()` | Screen/Window/Tab Share |
| `RTCPeerConnection` | WebRTC-Media |
| `RTCDataChannel` | optional für spätere Realtime-Daten |
| WebSocket | Chat, Presence, Signaling |
| WebRTC `getStats()` | Qualitätsmessung |
| Notifications API | optionale Browser-Benachrichtigungen |
| IndexedDB | lokaler Cache |
| Web Workers | optionale Verarbeitung/Stats |

---

## 11. Rollen und Nutzergruppen

### 11.1 Systemrollen

| Rolle | Beschreibung |
|---|---|
| System Admin | Verwaltet Installation, globale Einstellungen, Abuse, Logs |
| Support Admin | Kann Diagnoseinfos sehen, aber keine Passwörter/Secrets |
| Normal User | Normales Konto |
| Suspended User | Global gesperrtes Konto |

### 11.2 Workspace-Rollen

| Rolle | Beschreibung |
|---|---|
| Owner | Besitzer eines Workspaces, nicht entziehbar außer Transfer |
| Administrator | Fast alle Rechte im Workspace |
| Moderator | Moderationsrechte, keine kritische Serververwaltung |
| Member | Standardrolle |
| Guest | Optionaler eingeschränkter Gast |

### 11.3 Voice-Rollen zur Laufzeit

| Zustand | Beschreibung |
|---|---|
| Connected | Nutzer ist im Voice-Channel |
| Speaking | Nutzer spricht gerade |
| Muted Self | Nutzer hat sich selbst stummgeschaltet |
| Deafened Self | Nutzer hört nichts und sendet nicht |
| Muted Server | Moderator hat Nutzer stummgeschaltet |
| Suppressed | Nutzer darf hören, aber nicht sprechen |
| Streaming Screen | Nutzer teilt Bildschirm |
| Streaming Camera | Nutzer sendet Kamera |

---

## 12. Rechtekonzept

### 12.1 Grundprinzipien

Das Rechtekonzept muss folgende Regeln erfüllen:

1. Rechte sind bitbasiert.
2. Rollen enthalten Rechte.
3. Mitglieder können mehrere Rollen haben.
4. Channel-Nodes erben Rechte vom Parent.
5. Jeder Channel-Node kann Overrides haben.
6. Overrides können für Rollen oder einzelne Mitglieder gelten.
7. Explizites Deny schlägt Allow auf gleicher Ebene.
8. User-spezifische Overrides schlagen Rollen-Overrides.
9. Tiefere Channel-Overrides schlagen geerbte Parent-Overrides.
10. `ADMINISTRATOR` umgeht alle normalen Rechteprüfungen, außer Owner-only-Aktionen.
11. Backend prüft jede Aktion serverseitig.
12. Frontend darf Rechte nur zur Darstellung nutzen, nie als Sicherheitsinstanz.

### 12.2 Permission Bits

```ts
export enum Permission {
  // Workspace
  ADMINISTRATOR          = 1n << 0n,
  MANAGE_WORKSPACE       = 1n << 1n,
  MANAGE_ROLES           = 1n << 2n,
  MANAGE_CHANNELS        = 1n << 3n,
  MANAGE_INVITES         = 1n << 4n,
  VIEW_AUDIT_LOG         = 1n << 5n,

  // Membership / Moderation
  KICK_MEMBERS           = 1n << 6n,
  BAN_MEMBERS            = 1n << 7n,
  TIMEOUT_MEMBERS        = 1n << 8n,

  // Channel visibility
  VIEW_CHANNEL           = 1n << 9n,
  READ_MESSAGE_HISTORY   = 1n << 10n,

  // Text
  SEND_MESSAGES          = 1n << 11n,
  EDIT_OWN_MESSAGES      = 1n << 12n,
  DELETE_OWN_MESSAGES    = 1n << 13n,
  MANAGE_MESSAGES        = 1n << 14n,
  MENTION_MEMBERS        = 1n << 15n,
  MENTION_EVERYONE       = 1n << 16n,

  // Voice
  CONNECT_VOICE          = 1n << 17n,
  SPEAK                  = 1n << 18n,
  USE_VAD                = 1n << 19n,
  USE_PUSH_TO_TALK       = 1n << 20n,

  // Media
  STREAM_CAMERA          = 1n << 21n,
  SHARE_SCREEN           = 1n << 22n,
  SHARE_SCREEN_4K        = 1n << 23n,
  PRIORITY_AUDIO         = 1n << 24n,

  // Voice moderation
  MUTE_MEMBERS           = 1n << 25n,
  DEAFEN_MEMBERS         = 1n << 26n,
  MOVE_MEMBERS           = 1n << 27n,
  DISCONNECT_MEMBERS     = 1n << 28n,

  // Channel permissions
  MANAGE_CHANNEL_PERMS   = 1n << 29n,

  // System/debug
  VIEW_CHANNEL_STATS     = 1n << 30n,
}
```

### 12.3 Default-Rollen

#### Owner

Alle Rechte. Kann Workspace löschen und Ownership übertragen.

#### Administrator

Alle Rechte außer:

- Ownership übertragen,
- Workspace endgültig löschen,
- Owner entfernen,
- Owner-Rechte ändern.

#### Moderator

```text
VIEW_CHANNEL
READ_MESSAGE_HISTORY
SEND_MESSAGES
EDIT_OWN_MESSAGES
DELETE_OWN_MESSAGES
MANAGE_MESSAGES
CONNECT_VOICE
SPEAK
STREAM_CAMERA
SHARE_SCREEN
MUTE_MEMBERS
DEAFEN_MEMBERS
MOVE_MEMBERS
DISCONNECT_MEMBERS
KICK_MEMBERS
TIMEOUT_MEMBERS
VIEW_AUDIT_LOG
```

#### Member

```text
VIEW_CHANNEL
READ_MESSAGE_HISTORY
SEND_MESSAGES
EDIT_OWN_MESSAGES
DELETE_OWN_MESSAGES
CONNECT_VOICE
SPEAK
USE_VAD
USE_PUSH_TO_TALK
STREAM_CAMERA
SHARE_SCREEN
```

#### Guest

```text
VIEW_CHANNEL
CONNECT_VOICE
SPEAK
```

Guest darf standardmäßig keine alten Nachrichten lesen und keinen Screen teilen.

### 12.4 Permission Evaluation

```ts
function hasPermission(user, workspace, channelNode, permission): boolean {
  if (user.isSystemAdmin) return true;
  if (workspace.ownerId === user.id) return true;

  const base = calculateWorkspaceRolePermissions(user, workspace);

  if (base.has(Permission.ADMINISTRATOR)) return true;

  const path = getPathFromRootToNode(channelNode);

  let allowed = base;
  let denied = emptyPermissionSet();

  for (const node of path) {
    const roleOverrides = getRoleOverrides(user.roles, node);
    const userOverride = getUserOverride(user.id, node);

    applyOverrides(roleOverrides, allowed, denied);
    applyOverrides(userOverride, allowed, denied);
  }

  if (denied.has(permission)) return false;
  return allowed.has(permission);
}
```

### 12.5 Rechteabhängige Token-Ausgabe

Der Backend-Server darf SFU-Join-Tokens nur ausgeben, wenn:

- User Workspace-Member ist,
- User `VIEW_CHANNEL` hat,
- User `CONNECT_VOICE` hat,
- Channel vom Typ Voice oder Combined ist,
- User nicht gebannt oder getimeoutet ist,
- Voice-Channel nicht voll ist,
- Rate Limit nicht überschritten wurde.

Der Token muss enthalten:

| Feld | Bedeutung |
|---|---|
| `sub` | User ID |
| `workspace_id` | Workspace |
| `channel_id` | Voice Channel |
| `room` | SFU Room Name |
| `can_publish_audio` | aus `SPEAK` |
| `can_publish_camera` | aus `STREAM_CAMERA` |
| `can_publish_screen` | aus `SHARE_SCREEN` |
| `can_publish_screen_4k` | aus `SHARE_SCREEN_4K` |
| `can_subscribe` | aus `CONNECT_VOICE` |
| `exp` | kurzer Ablaufzeitpunkt |

---

## 13. Channel-Baumstruktur

### 13.1 Channel-Typen

```ts
export enum ChannelType {
  CATEGORY = "category",
  TEXT = "text",
  VOICE = "voice",
  COMBINED = "combined"
}
```

### 13.2 Channel Node

```ts
interface ChannelNode {
  id: string;
  workspaceId: string;
  parentId: string | null;
  type: ChannelType;
  name: string;
  slug: string;
  position: number;
  depth: number;
  path: string;
  inheritsPermissions: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### 13.3 Baumregeln

- Root darf mehrere Top-Level-Nodes haben.
- Kategorien dürfen Kategorien und Channels enthalten.
- Text/Voice/Combined dürfen keine Kinder haben.
- Maximale Tiefe im MVP: 5.
- Sortierung erfolgt über `position`.
- Drag-and-drop im UI muss möglich sein.
- Reordering muss atomar gespeichert werden.
- Backend muss Zyklen verhindern.
- Doppelte Slugs im gleichen Parent sind verboten.
- `path` muss für schnelle Abfragen gespeichert oder materialisiert berechnet werden.
- Rechte werden entlang des Pfads vererbt.

### 13.4 Channel Settings

#### Text Channel

```ts
interface TextChannelSettings {
  slowModeSeconds: number;
  maxMessageLength: number;
  allowMentions: boolean;
  allowEveryoneMention: boolean;
}
```

#### Voice Channel

```ts
interface VoiceChannelSettings {
  userLimit: number | null;
  defaultAudioMode: "voice" | "low_latency" | "music";
  defaultVideoQuality: "auto" | "720p" | "1080p" | "4k";
  allowCamera: boolean;
  allowScreenShare: boolean;
  allow4kScreenShare: boolean;
  requirePushToTalk: boolean;
  bitrateProfile: "auto" | "low" | "standard" | "high" | "ultra";
}
```

---

## 14. Chat-Anforderungen

### 14.1 Grundfunktionen

| ID | Anforderung |
|---|---|
| CHAT-001 | Nutzer mit `VIEW_CHANNEL` dürfen Channel sehen. |
| CHAT-002 | Nutzer mit `READ_MESSAGE_HISTORY` dürfen alte Nachrichten laden. |
| CHAT-003 | Nutzer mit `SEND_MESSAGES` dürfen Nachrichten senden. |
| CHAT-004 | Nutzer dürfen eigene Nachrichten bearbeiten, wenn `EDIT_OWN_MESSAGES`. |
| CHAT-005 | Nutzer dürfen eigene Nachrichten löschen, wenn `DELETE_OWN_MESSAGES`. |
| CHAT-006 | Moderatoren mit `MANAGE_MESSAGES` dürfen fremde Nachrichten löschen. |
| CHAT-007 | Nachrichten werden persistent in PostgreSQL gespeichert. |
| CHAT-008 | Nachrichten werden per WebSocket live verteilt. |
| CHAT-009 | Nachrichten haben `clientMessageId`, damit Duplikate vermieden werden. |
| CHAT-010 | Nachrichten werden cursor-basiert paginiert. |
| CHAT-011 | Markdown-Subset wird unterstützt. |
| CHAT-012 | HTML wird serverseitig sanitisiert oder gar nicht als HTML gespeichert. |
| CHAT-013 | Message-Edits erzeugen Audit-Metadaten. |
| CHAT-014 | Deletes sind Soft Deletes. |
| CHAT-015 | Hard Delete ist nur für Datenschutz/Admin-Operationen erlaubt. |

### 14.2 Message-Modell

```ts
interface Message {
  id: string;
  workspaceId: string;
  channelId: string;
  authorId: string;
  clientMessageId: string;
  content: string;
  contentFormat: "plain" | "markdown";
  editedAt: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### 14.3 Markdown-Subset

Erlaubt:

```text
**bold**
*italic*
`inline code`
code blocks
> quote
[link text](https://example.com)
```

Nicht erlaubt im MVP:

- Raw HTML,
- iframes,
- Script,
- automatische Link-Embeds,
- externe Vorschau-Scraper,
- Custom Emojis,
- Sticker,
- GIF-Integration.

### 14.4 Chat Rate Limits

| Aktion | Limit |
|---|---|
| Nachrichten senden | 5/s, Burst 10 |
| Nachricht bearbeiten | 10/min |
| Nachricht löschen | 20/min |
| Mentions | 10/min |
| `@everyone` | nur mit Permission, 2/min |
| Message History laden | 60 Requests/min |

---

## 15. Voice-Anforderungen

### 15.1 Join Flow

```text
1. Client klickt Voice Channel.
2. Client ruft POST /api/v1/voice/channels/:channelId/join auf.
3. Backend prüft Auth, Workspace, Permissions, Ban, Timeout, User Limit.
4. Backend erzeugt oder findet SFU Room.
5. Backend erzeugt SFU Join Token.
6. Backend erzeugt oder liefert gültige TURN Credentials.
7. Client verbindet zu SFU.
8. Client veröffentlicht Audio nur, wenn erlaubt.
9. Backend broadcastet VOICE_STATE_UPDATE.
10. Client zeigt Teilnehmerliste und Audiozustände.
```

### 15.2 Voice State

```ts
interface VoiceState {
  workspaceId: string;
  channelId: string;
  userId: string;
  sessionId: string;
  connectedAt: string;
  selfMuted: boolean;
  selfDeafened: boolean;
  serverMuted: boolean;
  serverDeafened: boolean;
  speaking: boolean;
  cameraEnabled: boolean;
  screenShareEnabled: boolean;
  audioMode: "voice" | "low_latency" | "music";
}
```

### 15.3 Mute/Deafen

- Self mute muss lokal sofort wirken.
- Self mute wird serverseitig synchronisiert.
- Server mute durch Moderator erzwingt Publish-Stop oder SFU-Mute.
- Deafen bedeutet: Nutzer hört keine anderen und sendet selbst kein Audio.
- Server deafen darf nur mit `DEAFEN_MEMBERS`.
- Alle Änderungen werden auditierbar gespeichert.

### 15.4 Push-to-Talk

- Globaler Hotkey innerhalb der Web-App.
- UI-Button als Alternative.
- Konfigurierbare Taste.
- Visueller Status.
- PTT darf nicht funktionieren, wenn User server-muted ist.
- Bei Fokusverlust: Taste darf nur wirken, soweit Browser das erlaubt.
- Kein nativer globaler System-Hotkey im MVP.

### 15.5 Voice Activity Detection

- VAD im Client.
- Empfindlichkeit einstellbar.
- Visuelles Speaking-Event.
- Debounce gegen Flackern.
- Speaking-Status über WebSocket oder SFU-Events synchronisieren.
- Kein Speaking-Status aus unberechtigtem Channel leaken.

---

## 16. Audioqualität

### 16.1 Audio Modi

#### Voice Mode

```ts
const voiceMode = {
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
};
```

#### Low Latency Mode

```ts
const lowLatencyMode = {
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
};
```

#### Music Mode

```ts
const musicMode = {
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
};
```

### 16.2 Audio-Anforderungen

| ID | Anforderung |
|---|---|
| AUD-001 | Opus muss genutzt werden. |
| AUD-002 | Fullband 48 kHz muss Ziel sein. |
| AUD-003 | Mono muss Default für Sprache sein. |
| AUD-004 | Stereo muss im Music Mode möglich sein. |
| AUD-005 | Echo Cancellation muss schaltbar sein. |
| AUD-006 | Noise Suppression muss schaltbar sein. |
| AUD-007 | Auto Gain Control muss schaltbar sein. |
| AUD-008 | Input-Gain-Anzeige muss vorhanden sein. |
| AUD-009 | Mic-Test muss vorhanden sein. |
| AUD-010 | Device-Wechsel während Call muss ohne Rejoin möglich sein. |
| AUD-011 | Paketverlust muss im UI sichtbar werden, wenn Qualität schlecht ist. |
| AUD-012 | Client muss Paketverlust, RTT, Jitter aus WebRTC Stats sammeln. |
| AUD-013 | Audio darf bei Videoüberlast priorisiert werden. |
| AUD-014 | Bei Bandbreitenknappheit muss Video zuerst reduziert werden, Audio zuletzt. |

---

## 17. Video- und Screenshare-Anforderungen

### 17.1 Kamera

| ID | Anforderung |
|---|---|
| VID-001 | Nutzer mit `STREAM_CAMERA` dürfen Kamera aktivieren. |
| VID-002 | Kamera-Preview muss lokal sichtbar sein. |
| VID-003 | Kamera muss während Voice-Session ein-/ausschaltbar sein. |
| VID-004 | Kamera darf nicht automatisch ohne Nutzeraktion starten. |
| VID-005 | Kameraauflösung wird adaptiv verhandelt. |
| VID-006 | 720p30 ist Default. |
| VID-007 | 1080p ist auswählbar. |
| VID-008 | 4K ist auswählbar, wenn Browsergerät es meldet. |
| VID-009 | Empfänger abonnieren nur benötigte Qualität. |
| VID-010 | Nicht sichtbare Videos werden pausiert oder niedrig abonniert. |

### 17.2 Screenshare

| ID | Anforderung |
|---|---|
| SCR-001 | Nutzer mit `SHARE_SCREEN` dürfen Bildschirm/Fenster/Tab teilen. |
| SCR-002 | Nutzer mit `SHARE_SCREEN_4K` dürfen 4K-Profil nutzen. |
| SCR-003 | Screen Capture muss über `getDisplayMedia()` erfolgen. |
| SCR-004 | Nutzer muss Browser-Auswahldialog sehen. |
| SCR-005 | App darf Screen Capture nicht heimlich starten. |
| SCR-006 | Screenshare muss lokal previewbar sein. |
| SCR-007 | Screenshare muss jederzeit stoppbar sein. |
| SCR-008 | Wenn Browser System-/Tab-Audio liefert, soll es mitsendbar sein. |
| SCR-009 | Screenshare soll `contentHint = "detail"` setzen, soweit verfügbar. |
| SCR-010 | 4K-Profil muss 3840×2160 ideal anfragen. |
| SCR-011 | 4K-Profil muss auf 1440p/1080p degradieren können. |
| SCR-012 | Text/Code auf Screenshare muss priorisiert scharf bleiben. |
| SCR-013 | Bei schlechter Verbindung muss FPS vor Auflösung reduziert werden, wenn Detailmodus aktiv ist. |
| SCR-014 | Bei Videomodus darf Auflösung vor FPS reduziert werden. |

### 17.3 Screenshare Constraints

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

Wichtig: Diese Constraints sind Ziele. Browser und Nutzerentscheidung bestimmen, was tatsächlich geliefert wird.

### 17.4 Codecs

| Priorität | Codec |
|---|---|
| 1 | AV1, wenn Browser/SFU/Hardware stabil |
| 2 | VP9 mit SVC |
| 3 | VP8 mit Simulcast |
| 4 | H.264 Fallback |

Muss:

- Codec-Auswahl zur Laufzeit über Browser-Capabilities prüfen.
- Kein harter Codec-Zwang, der Safari/Firefox/Chromium kaputtmacht.
- Codec-Reihenfolge serverseitig konfigurierbar.
- Kein proprietärer Transcoding-Dienst.
- SFU soll möglichst nur weiterleiten, nicht transcodieren.

### 17.5 Simulcast/SVC

| Stream | Vorgabe |
|---|---|
| Kamera | Simulcast/SVC mit mehreren Qualitätsstufen |
| Screenshare 1080p | eine hohe Schicht plus optionale niedrige Preview |
| Screenshare 4K | bevorzugt SVC, sonst Single High Stream |
| Thumbnails | niedrigste Stufe |
| Fokusansicht | höchste verfügbare Stufe |
| Hintergrundteilnehmer | nicht abonnieren oder niedrigste Stufe |

---

## 18. NAT, STUN, TURN und coturn

### 18.1 coturn-Pflicht

coturn muss Bestandteil der Referenzinstallation sein.

Anregungen aus coturn:

- STUN/TURN über UDP und TCP.
- TURNS über TLS.
- Langzeit-Credentials oder REST-API-Credentials.
- Auth Secret für temporäre Credentials.
- Relay-Port-Range konfigurierbar.
- Quotas pro User und global.
- Datenbank-Backends möglich, aber MVP soll mit statischem Auth Secret starten.
- Prometheus-Monitoring verwenden, wenn verfügbar.
- Keine anonymen TURN-Zugänge.

### 18.2 TURN-Credentials

Browser dürfen keine permanenten TURN-Zugangsdaten erhalten.

Das Backend muss zeitlich begrenzte TURN-Credentials erzeugen:

```ts
interface TurnCredentials {
  urls: string[];
  username: string;
  credential: string;
  ttlSeconds: number;
  expiresAt: string;
}
```

Empfohlene TTL:

```text
600 bis 1800 Sekunden
```

### 18.3 ICE Server Response

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

### 18.4 coturn Ports

Firewall muss öffnen:

```text
TCP 443        Web App / API / WSS
UDP 443        optional WebRTC-over-443, falls SFU so konfiguriert wird
UDP 3478       STUN/TURN
TCP 3478       TURN TCP fallback
TCP 5349       TURNS
UDP 5349       TURN DTLS, falls genutzt
UDP 49152-65535 TURN relay range, oder eigene konfigurierte Range
```

### 18.5 coturn Beispielkonfiguration

Siehe zusätzlich `infra/turnserver.example.conf`.

```conf
listening-port=3478
tls-listening-port=5349
realm=voice.example.com
server-name=voice.example.com
fingerprint
lt-cred-mech
use-auth-secret
static-auth-secret=${TURN_SHARED_SECRET}
cert=/etc/coturn/fullchain.pem
pkey=/etc/coturn/privkey.pem
min-port=49152
max-port=65535
no-multicast-peers
prometheus
prometheus-port=9641
log-file=stdout
simple-log
new-log-timestamp
```

---

## 19. Authentifizierung

### 19.1 Login-Varianten

MVP muss haben:

- Email + Passwort.
- Session Cookie.
- Logout.
- Passwort ändern.
- Passwort zurücksetzen.

Soll später:

- Passkeys/WebAuthn.
- TOTP 2FA.

### 19.2 Passwortsicherheit

- Argon2id für Passwort-Hashing.
- Pro-User Salt.
- Pepper optional serverseitig.
- Keine Klartextpasswörter in Logs.
- Login Rate Limit.
- Session Rotation nach Login.
- CSRF-Schutz bei Cookie-Auth.

### 19.3 Session-Modell

```ts
interface Session {
  id: string;
  userId: string;
  hashedToken: string;
  userAgent: string;
  ipHash: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
}
```

### 19.4 Auth Rate Limits

| Aktion | Limit |
|---|---|
| Login pro IP | 10/10 min |
| Login pro Account | 5/10 min |
| Register pro IP | 5/h |
| Passwort Reset | 3/h |
| Session Refresh | 60/min |

---

## 20. Workspace-Anforderungen

### 20.1 Workspace-Modell

```ts
interface Workspace {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  iconFileId: string | null;
  defaultRoleId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
```

### 20.2 Workspace-Funktionen

| ID | Anforderung |
|---|---|
| WS-001 | User kann Workspace erstellen. |
| WS-002 | Owner kann Workspace umbenennen. |
| WS-003 | Owner kann Workspace löschen. |
| WS-004 | Owner kann Ownership übertragen. |
| WS-005 | Admin kann Einstellungen ändern, aber Owner nicht entfernen. |
| WS-006 | Workspace hat Member-Liste. |
| WS-007 | Workspace hat Rollen. |
| WS-008 | Workspace hat Channel-Baum. |
| WS-009 | Workspace hat Audit-Log. |
| WS-010 | Workspace kann Invites erzeugen. |
| WS-011 | Workspace kann Nutzer bannen. |
| WS-012 | Workspace kann Nutzer kicken. |

---

## 21. Invite-System

### 21.1 Invite-Modell

```ts
interface Invite {
  id: string;
  workspaceId: string;
  code: string;
  createdBy: string;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}
```

### 21.2 Anforderungen

| ID | Anforderung |
|---|---|
| INV-001 | Nur User mit `MANAGE_INVITES` dürfen Invites erstellen. |
| INV-002 | Invite-Code muss zufällig und nicht erratbar sein. |
| INV-003 | Invites können Ablaufzeit haben. |
| INV-004 | Invites können Nutzungslimit haben. |
| INV-005 | Invites können widerrufen werden. |
| INV-006 | Join über Invite prüft Ban-Liste. |
| INV-007 | Invite-Nutzung wird auditierbar gespeichert. |

---

## 22. Moderation

### 22.1 Kick

| ID | Anforderung |
|---|---|
| MOD-001 | User mit `KICK_MEMBERS` dürfen Member entfernen. |
| MOD-002 | Owner darf nicht gekickt werden. |
| MOD-003 | Höhere Rollen dürfen niedrigere Rollen kicken. |
| MOD-004 | Kick erzeugt Audit-Log. |
| MOD-005 | Gekickter User kann über neuen Invite wieder beitreten. |

### 22.2 Ban

| ID | Anforderung |
|---|---|
| MOD-006 | User mit `BAN_MEMBERS` dürfen Member bannen. |
| MOD-007 | Ban verhindert Invite-Join. |
| MOD-008 | Ban kann Grund enthalten. |
| MOD-009 | Ban kann aufgehoben werden. |
| MOD-010 | Ban erzeugt Audit-Log. |

### 22.3 Timeout

| ID | Anforderung |
|---|---|
| MOD-011 | User mit `TIMEOUT_MEMBERS` dürfen temporär einschränken. |
| MOD-012 | Timeout verhindert Schreiben und Sprechen. |
| MOD-013 | Timeout-Zeit ist begrenzt. |
| MOD-014 | Timeout erzeugt Audit-Log. |

### 22.4 Voice Moderation

| ID | Anforderung |
|---|---|
| MOD-015 | Moderator kann User server-muten. |
| MOD-016 | Moderator kann User server-deafen. |
| MOD-017 | Moderator kann User in anderen Voice-Channel verschieben. |
| MOD-018 | Moderator kann User aus Voice disconnecten. |
| MOD-019 | Alle Voice-Moderationsaktionen werden live synchronisiert. |
| MOD-020 | Alle Voice-Moderationsaktionen erzeugen Audit-Log. |

---

## 23. Audit-Log

### 23.1 Audit Events

```ts
type AuditEvent =
  | "WORKSPACE_CREATE"
  | "WORKSPACE_UPDATE"
  | "WORKSPACE_DELETE"
  | "CHANNEL_CREATE"
  | "CHANNEL_UPDATE"
  | "CHANNEL_DELETE"
  | "CHANNEL_MOVE"
  | "ROLE_CREATE"
  | "ROLE_UPDATE"
  | "ROLE_DELETE"
  | "ROLE_ASSIGN"
  | "ROLE_REMOVE"
  | "PERMISSION_OVERRIDE_CREATE"
  | "PERMISSION_OVERRIDE_UPDATE"
  | "PERMISSION_OVERRIDE_DELETE"
  | "MEMBER_KICK"
  | "MEMBER_BAN"
  | "MEMBER_UNBAN"
  | "MEMBER_TIMEOUT"
  | "MESSAGE_DELETE"
  | "VOICE_SERVER_MUTE"
  | "VOICE_SERVER_DEAFEN"
  | "VOICE_MOVE"
  | "VOICE_DISCONNECT"
  | "INVITE_CREATE"
  | "INVITE_REVOKE";
```

### 23.2 Audit-Modell

```ts
interface AuditLogEntry {
  id: string;
  workspaceId: string;
  actorId: string;
  targetType: string;
  targetId: string | null;
  event: AuditEvent;
  reason: string | null;
  metadata: Record<string, unknown>;
  ipHash: string | null;
  createdAt: string;
}
```

---

## 24. Datenmodell

### 24.1 Tabellen

#### `users`

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  avatar_file_id UUID NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ NULL
);
```

#### `workspaces`

```sql
CREATE TABLE workspaces (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  icon_file_id UUID NULL,
  default_role_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ NULL
);
```

#### `workspace_members`

```sql
CREATE TABLE workspace_members (
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  user_id UUID NOT NULL REFERENCES users(id),
  nickname TEXT NULL,
  joined_at TIMESTAMPTZ NOT NULL,
  timeout_until TIMESTAMPTZ NULL,
  PRIMARY KEY (workspace_id, user_id)
);
```

#### `roles`

```sql
CREATE TABLE roles (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  position INT NOT NULL,
  permissions NUMERIC(40,0) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
```

#### `member_roles`

```sql
CREATE TABLE member_roles (
  workspace_id UUID NOT NULL,
  user_id UUID NOT NULL,
  role_id UUID NOT NULL REFERENCES roles(id),
  assigned_by UUID NULL REFERENCES users(id),
  assigned_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, user_id, role_id)
);
```

#### `channel_nodes`

```sql
CREATE TABLE channel_nodes (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  parent_id UUID NULL REFERENCES channel_nodes(id),
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  position INT NOT NULL,
  depth INT NOT NULL,
  path TEXT NOT NULL,
  inherits_permissions BOOLEAN NOT NULL DEFAULT TRUE,
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ NULL,
  UNIQUE (workspace_id, parent_id, slug)
);
```

#### `permission_overrides`

```sql
CREATE TABLE permission_overrides (
  id UUID PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES channel_nodes(id),
  target_type TEXT NOT NULL CHECK (target_type IN ('role', 'member')),
  target_id UUID NOT NULL,
  allow NUMERIC(40,0) NOT NULL DEFAULT 0,
  deny NUMERIC(40,0) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (channel_id, target_type, target_id)
);
```

#### `messages`

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  channel_id UUID NOT NULL REFERENCES channel_nodes(id),
  author_id UUID NOT NULL REFERENCES users(id),
  client_message_id TEXT NOT NULL,
  content TEXT NOT NULL,
  content_format TEXT NOT NULL DEFAULT 'markdown',
  edited_at TIMESTAMPTZ NULL,
  deleted_at TIMESTAMPTZ NULL,
  deleted_by UUID NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (channel_id, author_id, client_message_id)
);
```

#### `voice_states`

```sql
CREATE TABLE voice_states (
  workspace_id UUID NOT NULL,
  channel_id UUID NOT NULL,
  user_id UUID NOT NULL,
  session_id UUID NOT NULL,
  self_muted BOOLEAN NOT NULL DEFAULT FALSE,
  self_deafened BOOLEAN NOT NULL DEFAULT FALSE,
  server_muted BOOLEAN NOT NULL DEFAULT FALSE,
  server_deafened BOOLEAN NOT NULL DEFAULT FALSE,
  camera_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  screen_share_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  connected_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);
```

#### `bans`

```sql
CREATE TABLE bans (
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  user_id UUID NOT NULL REFERENCES users(id),
  banned_by UUID NOT NULL REFERENCES users(id),
  reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);
```

#### `invites`

```sql
CREATE TABLE invites (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  code TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES users(id),
  max_uses INT NULL,
  used_count INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL
);
```

#### `audit_log`

```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  actor_id UUID NULL REFERENCES users(id),
  event TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID NULL,
  reason TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  ip_hash TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
```

### 24.2 Indizes

```sql
CREATE INDEX idx_messages_channel_created
ON messages(channel_id, created_at DESC);

CREATE INDEX idx_channel_nodes_workspace_parent_position
ON channel_nodes(workspace_id, parent_id, position);

CREATE INDEX idx_audit_log_workspace_created
ON audit_log(workspace_id, created_at DESC);

CREATE INDEX idx_voice_states_channel
ON voice_states(workspace_id, channel_id);

CREATE INDEX idx_roles_workspace_position
ON roles(workspace_id, position);
```

---

## 25. REST API

### 25.1 API-Konventionen

- JSON.
- Versionierung über `/api/v1`.
- Fehlerformat einheitlich.
- Auth über Secure HttpOnly Cookie oder Bearer Token.
- Alle schreibenden Requests prüfen CSRF, falls Cookie-Auth.
- Alle IDs als UUID oder ULID.
- Alle Zeitwerte ISO 8601 UTC.

### 25.2 Fehlerformat

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Missing permission: CONNECT_VOICE",
    "requestId": "req_123",
    "details": {
      "permission": "CONNECT_VOICE"
    }
  }
}
```

### 25.3 Auth

```http
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/logout
POST /api/v1/auth/password-reset/request
POST /api/v1/auth/password-reset/confirm
GET  /api/v1/me
```

### 25.4 Workspaces

```http
POST   /api/v1/workspaces
GET    /api/v1/workspaces
GET    /api/v1/workspaces/:workspaceId
PATCH  /api/v1/workspaces/:workspaceId
DELETE /api/v1/workspaces/:workspaceId
GET    /api/v1/workspaces/:workspaceId/members
GET    /api/v1/workspaces/:workspaceId/tree
GET    /api/v1/workspaces/:workspaceId/audit-log
```

### 25.5 Channels

```http
POST   /api/v1/workspaces/:workspaceId/channels
GET    /api/v1/channels/:channelId
PATCH  /api/v1/channels/:channelId
DELETE /api/v1/channels/:channelId
POST   /api/v1/workspaces/:workspaceId/channels/reorder
```

### 25.6 Messages

```http
GET    /api/v1/channels/:channelId/messages?before=&after=&limit=
POST   /api/v1/channels/:channelId/messages
PATCH  /api/v1/messages/:messageId
DELETE /api/v1/messages/:messageId
```

### 25.7 Roles

```http
GET    /api/v1/workspaces/:workspaceId/roles
POST   /api/v1/workspaces/:workspaceId/roles
PATCH  /api/v1/roles/:roleId
DELETE /api/v1/roles/:roleId
POST   /api/v1/workspaces/:workspaceId/roles/reorder
PUT    /api/v1/workspaces/:workspaceId/members/:userId/roles/:roleId
DELETE /api/v1/workspaces/:workspaceId/members/:userId/roles/:roleId
```

### 25.8 Permissions

```http
GET    /api/v1/channels/:channelId/permission-overrides
PUT    /api/v1/channels/:channelId/permission-overrides/:targetType/:targetId
DELETE /api/v1/channels/:channelId/permission-overrides/:targetType/:targetId
GET    /api/v1/channels/:channelId/effective-permissions/me
```

### 25.9 Voice / Media

```http
POST   /api/v1/voice/channels/:channelId/join
POST   /api/v1/voice/leave
PATCH  /api/v1/voice/state
POST   /api/v1/voice/channels/:channelId/move-member
POST   /api/v1/voice/mute-member
POST   /api/v1/voice/deafen-member
POST   /api/v1/voice/disconnect-member
GET    /api/v1/turn/credentials
```

### 25.10 Join Response

```json
{
  "room": {
    "provider": "livekit",
    "roomName": "ws_123_ch_456",
    "url": "wss://sfu.example.com"
  },
  "token": "media_join_token",
  "permissions": {
    "publishAudio": true,
    "publishCamera": true,
    "publishScreen": true,
    "publishScreen4k": false,
    "subscribe": true
  },
  "iceServers": [
    {
      "urls": [
        "stun:turn.example.com:3478",
        "turn:turn.example.com:3478?transport=udp",
        "turns:turn.example.com:5349?transport=tcp"
      ],
      "username": "1760000000:user_123",
      "credential": "secret"
    }
  ],
  "mediaPolicy": {
    "audioMode": "voice",
    "videoQuality": "auto",
    "screenShareMax": "1080p"
  }
}
```

---

## 26. WebSocket API

### 26.1 Verbindung

```text
Client -> GET /api/v1/gateway
Server -> HELLO { heartbeatIntervalMs }
Client -> IDENTIFY { sessionToken }
Server -> READY { user, workspaces }
```

### 26.2 Envelope

```ts
interface GatewayMessage<T = unknown> {
  op: "HELLO" | "IDENTIFY" | "READY" | "HEARTBEAT" | "DISPATCH" | "ERROR";
  t?: string;
  s?: number;
  d?: T;
}
```

### 26.3 Client Events

```ts
type ClientEvent =
  | "PRESENCE_UPDATE"
  | "VOICE_JOIN"
  | "VOICE_LEAVE"
  | "VOICE_STATE_UPDATE"
  | "TYPING_START"
  | "TYPING_STOP";
```

### 26.4 Server Events

```ts
type ServerEvent =
  | "WORKSPACE_UPDATE"
  | "MEMBER_JOIN"
  | "MEMBER_LEAVE"
  | "MEMBER_UPDATE"
  | "CHANNEL_CREATE"
  | "CHANNEL_UPDATE"
  | "CHANNEL_DELETE"
  | "CHANNEL_REORDER"
  | "ROLE_CREATE"
  | "ROLE_UPDATE"
  | "ROLE_DELETE"
  | "MESSAGE_CREATE"
  | "MESSAGE_UPDATE"
  | "MESSAGE_DELETE"
  | "VOICE_STATE_UPDATE"
  | "SPEAKING_UPDATE"
  | "MEDIA_QUALITY_UPDATE"
  | "PERMISSION_UPDATE";
```

### 26.5 Heartbeat

- Server gibt Intervall vor.
- Client sendet Heartbeat.
- Server antwortet ACK.
- Bei fehlenden ACKs reconnectet Client.
- Reconnect nutzt Resume Token.
- Events haben Sequenznummern.

---

## 27. Frontend-Anforderungen

### 27.1 Layout

```text
+------------------------------------------------------------+
| Top Bar: Workspace / Channel / Connection Quality          |
+-----------+-------------------------------+----------------+
| Channel   | Main Area                     | Member/Voice   |
| Tree      | - Chat                        | Panel          |
|           | - Voice Room                  |                |
|           | - Video Grid / Screen Share   |                |
+-----------+-------------------------------+----------------+
| Bottom: Mic | Headphones | Camera | Share | Settings       |
+------------------------------------------------------------+
```

### 27.2 UI-Pflichtbereiche

| Bereich | Muss |
|---|---|
| Workspace Switcher | ja |
| Channel Tree | ja |
| Text Chat | ja |
| Voice Panel | ja |
| Video Grid | ja |
| Screen Focus View | ja |
| User Settings | ja |
| Audio Device Settings | ja |
| Video Device Settings | ja |
| Permission Editor | ja |
| Role Editor | ja |
| Audit Log | ja |
| Connection Quality Indicator | ja |

### 27.3 Minimal UI

Kein visuelles Überladen.

Muss:

- klare Channel-Liste,
- klare Join/Leave-Buttons,
- klare Mute/Deafen/Camera/Share-Buttons,
- sichtbarer Verbindungsstatus,
- sichtbares Mikrofon-Level,
- sichtbare Sprecheranzeige,
- klare Fehlermeldungen.

Nicht im MVP:

- Themes,
- animierte Avatare,
- Sticker,
- komplexe Profile,
- Serverbanner,
- Reactions.

### 27.4 Accessibility

- Tastaturbedienung für Hauptfunktionen.
- ARIA Labels für Buttons.
- Fokuszustände sichtbar.
- Farbkontrast WCAG AA.
- Screenreader-taugliche Fehlermeldungen.
- Mute/Deafen nicht nur farblich anzeigen.
- Reduced Motion respektieren.

---

## 28. Presence

### 28.1 Status

```ts
type PresenceStatus = "online" | "idle" | "dnd" | "offline";
```

### 28.2 Anforderungen

| ID | Anforderung |
|---|---|
| PRE-001 | Online-Status wird per WebSocket verteilt. |
| PRE-002 | Idle nach konfigurierbarer Inaktivität. |
| PRE-003 | DND manuell setzbar. |
| PRE-004 | Offline bei Disconnect nach Timeout. |
| PRE-005 | Presence darf keine privaten Channel leaken. |
| PRE-006 | Voice-Presence nur für Nutzer mit `VIEW_CHANNEL`. |

---

## 29. Sicherheitsanforderungen

### 29.1 Transport Security

- HTTPS überall.
- WSS für Gateway.
- HSTS.
- Secure Cookies.
- SameSite Cookies.
- TLS 1.2+, TLS 1.3 bevorzugt.
- Keine Mixed-Content-Ressourcen.
- Reverse Proxy mit Security Headers.

### 29.2 Web Security

- CSP.
- XSS-Schutz durch Sanitizing/Escaping.
- CSRF-Schutz bei Cookie-Auth.
- CORS restriktiv.
- Keine Secrets im Frontend.
- Keine TURN-Static-Secrets im Frontend.
- Kein Logging von Passwörtern, Tokens, Message Content in Debug-Logs.
- Uploads im MVP deaktivieren oder streng validieren.

### 29.3 Media Security

- SFU-Tokens kurzlebig.
- TURN-Credentials kurzlebig.
- SFU-Rooms an Channel IDs gebunden.
- Backend widerruft/entzieht Publish-Rechte bei Permission-Änderung.
- Moderationsaktionen setzen SFU-State durch.
- Keine Medienaufzeichnung ohne explizite Funktion und Consent.

### 29.4 Optional E2EE

Soll später:

- E2EE als optionaler Modus.
- Pro Voice-Channel aktivierbar.
- Key Rotation.
- UI-Indikator.
- Keine falsche Behauptung „E2EE aktiv“, wenn Browser/Codec/Pipeline es nicht unterstützt.
- SFU darf bei E2EE nur Routing-Metadaten sehen.

---

## 30. Datenschutz

### 30.1 Datenspeicherung

| Datenart | Speicherung |
|---|---|
| Accountdaten | persistent |
| Workspace-Mitgliedschaft | persistent |
| Rollen/Rechte | persistent |
| Chat | persistent |
| Voice State | temporär, letzter Zustand optional |
| Audio/Video | nicht speichern |
| WebRTC Stats | aggregiert, begrenzt |
| IP-Adressen | gehasht oder gekürzt |
| Audit Logs | persistent mit Retention |

### 30.2 Retention

| Datenart | Standard |
|---|---|
| Chat | unbegrenzt bis Löschung |
| Audit Log | 180 Tage |
| Gateway Logs | 14 Tage |
| WebRTC Detailstats | 7 Tage |
| Aggregierte Qualitätsmetriken | 90 Tage |
| Sessions | bis Ablauf + 30 Tage |
| Gelöschte User | pseudonymisieren |

---

## 31. Performance- und Skalierungsanforderungen

### 31.1 MVP-Zielgrößen

| Metrik | Ziel |
|---|---|
| Workspaces pro Installation | 1.000 |
| Member pro Workspace | 10.000 |
| Channels pro Workspace | 1.000 |
| Tiefe Channel-Baum | 5 |
| Gleichzeitige WebSocket-Verbindungen | 10.000 |
| Gleichzeitige Voice-Teilnehmer pro SFU Node | hardwareabhängig, benchmarkpflichtig |
| Voice-Channel Soft Cap | 50 |
| Voice-Channel Hard Cap Default | 100 |
| Gleichzeitige 4K-Screenshares pro Channel | Default 1 aktiv im Fokus |
| Chat-Nachrichten pro Sekunde | 1.000 installationweit im MVP-Ziel |

### 31.2 Client Performance

- Channel Tree virtualisieren, wenn > 300 Nodes.
- Message List virtualisieren.
- Video Tiles nur rendern, wenn sichtbar.
- Nicht sichtbare Streams nicht hochqualitativ abonnieren.
- WebRTC Stats throttlen.
- Keine unnötigen Re-Renders bei Speaking Events.
- Initial Load unter 2 s bei normaler Verbindung.
- Bundle Splitting.

### 31.3 Backend Performance

- Permission Checks cachen.
- Cache invalidieren bei Rollen-/Override-Änderungen.
- Chat Inserts idempotent machen.
- WebSocket Events horizontal verteilen können.
- Redis/Valkey PubSub oder Streams nutzen.
- Database-Migrations versionieren.
- N+1 Queries vermeiden.
- Pagination immer cursorbasiert.

---

## 32. Monitoring und Observability

### 32.1 Client-Metriken

```ts
interface ClientRtcQualitySample {
  workspaceId: string;
  channelId: string;
  userId: string;
  sessionId: string;
  timestamp: string;

  audio: {
    rttMs: number | null;
    jitterMs: number | null;
    packetsLost: number;
    packetsReceived: number;
    bitrateBps: number | null;
    concealedSamples: number | null;
  };

  video: {
    width: number | null;
    height: number | null;
    framesPerSecond: number | null;
    framesDropped: number | null;
    bitrateBps: number | null;
    packetsLost: number;
  };

  connection: {
    iceState: string;
    selectedCandidateType: "host" | "srflx" | "relay" | "unknown";
    transport: "udp" | "tcp" | "tls" | "unknown";
  };
}
```

### 32.2 Server-Metriken

| Metrik | Beschreibung |
|---|---|
| `gateway_connections` | aktive WebSocket-Verbindungen |
| `messages_sent_total` | Chat-Nachrichten |
| `voice_joins_total` | Voice Joins |
| `voice_join_failures_total` | fehlgeschlagene Voice Joins |
| `permission_denied_total` | verweigerte Aktionen |
| `turn_credentials_issued_total` | TURN-Creds |
| `sfu_rooms_active` | aktive SFU-Räume |
| `sfu_participants_active` | aktive Media-Teilnehmer |
| `rtc_relay_ratio` | Anteil TURN Relay |
| `rtc_packet_loss_avg` | aggregierter Paketverlust |
| `rtc_audio_rtt_p95` | Audio RTT P95 |
| `rtc_video_bitrate_avg` | Video Bitrate |

### 32.3 Dashboards

- System Health.
- Voice Quality.
- TURN Usage.
- SFU Load.
- WebSocket Load.
- Chat Throughput.
- Error Rate.
- Permission Denied Rate.

### 32.4 Alerts

| Alert | Bedingung |
|---|---|
| High TURN Relay Ratio | > 50 % über 15 min |
| Audio Packet Loss | P95 > 5 % über 10 min |
| SFU CPU High | > 85 % über 10 min |
| WebSocket Disconnect Spike | > 3× baseline |
| DB Slow Queries | P95 > 250 ms |
| TURN Allocation Failures | > 5 % |
| Voice Join Failures | > 2 % |

---

## 33. Deployment

### 33.1 Docker Compose MVP

Siehe `infra/docker-compose.example.yml`.

### 33.2 Produktionsanforderungen

- TLS-Zertifikate automatisch erneuern.
- Secrets nicht im Repo.
- Backups für PostgreSQL.
- Restore-Test dokumentiert.
- Migrations vor Deploy.
- Health Checks.
- Readiness Checks.
- Graceful Shutdown.
- Zero-Downtime Deploy für API, soweit möglich.
- SFU-Wartung drainen, bevor beendet wird.
- TURN-Port-Range dokumentieren.

---

## 34. Akzeptanzkriterien

### 34.1 Funktionale Akzeptanz

| Kriterium | Test |
|---|---|
| User kann registrieren/login/logout | E2E |
| Workspace erstellen | E2E |
| Channel-Baum erstellen | E2E |
| Channel verschieben | E2E |
| Rollen erstellen | E2E |
| Rechte setzen | E2E |
| Rechte werden korrekt erzwungen | Unit + E2E |
| Chat senden/empfangen | E2E |
| Chat History laden | E2E |
| Voice join/leave | E2E manuell/automatisiert |
| Mute/deafen | E2E |
| Server mute/deafen | E2E |
| Kamera starten | E2E manuell |
| Screen teilen | E2E manuell |
| 4K Screen anfragen | E2E manuell mit 4K Display |
| TURN fallback funktioniert | Netzwerktest |
| Audit Log schreibt | Integration |
| Rate Limits greifen | Integration |

### 34.2 Rechte-Akzeptanzfälle

| Fall | Erwartung |
|---|---|
| Kein `VIEW_CHANNEL` | Channel unsichtbar, API 403 |
| `VIEW_CHANNEL`, kein `SEND_MESSAGES` | Lesen ja, Schreiben nein |
| `CONNECT_VOICE`, kein `SPEAK` | Join ja, Audio Publish nein |
| `SPEAK`, aber server-muted | Audio Publish nein |
| `SHARE_SCREEN`, kein `SHARE_SCREEN_4K` | Screenshare ja, 4K-Profil nein |
| Role Allow, Channel Deny | Deny gewinnt |
| Parent Deny, Child Allow | tiefere Ebene kann erlauben, wenn explizit so überschrieben |
| User Override Allow | gewinnt gegen Role Deny auf gleicher Ebene |
| Administrator | darf alles außer Owner-only |
| Owner | darf alles |

### 34.3 Medien-Akzeptanz

| Kriterium | Erwartung |
|---|---|
| Audio bei 1 % Loss | Gespräch verständlich, UI zeigt Qualität |
| Audio bei Videoüberlast | Audio bleibt priorisiert |
| 1080p Screenshare | stabil bei ausreichender Bandbreite |
| 4K Screenshare | wird angefordert und bei Eignung übertragen |
| 4K Degradation | fällt sauber auf 1440p/1080p zurück |
| TURN-only Netzwerk | Voice funktioniert über TURN |
| TCP-only Netzwerk | Voice funktioniert mit höherer Latenz über TURN TCP/TLS |
| Device-Wechsel | kein vollständiger Rejoin nötig |
| SFU reconnect | Client verbindet automatisch neu |

---

## 35. Testplan

### 35.1 Unit Tests

Muss testen:

- Permission Evaluation.
- Role Hierarchy.
- Channel Tree Validation.
- Invite Validation.
- Message Sanitizing.
- Rate Limits.
- TURN Credential Generation.
- Media Token Claims.
- Audit Log Writer.

### 35.2 Integration Tests

Muss testen:

- Auth + Session.
- Workspace CRUD.
- Channel CRUD.
- Message CRUD.
- Role Assignment.
- Permission Overrides.
- Voice Join Token.
- Ban/Timeout Enforcement.
- WebSocket Dispatch.
- Redis PubSub.
- PostgreSQL Migrations.

### 35.3 E2E Tests

Mit Playwright:

- Login.
- Workspace erstellen.
- Channel erstellen.
- Nachricht senden.
- Rechte verweigern.
- Voice Join UI.
- Mute Button.
- Channel Reorder.
- Role Editor.

### 35.4 Manuelle RTC Tests

| Szenario | Geräte |
|---|---|
| 2 Nutzer Audio | Chrome + Firefox |
| 5 Nutzer Audio | Chrome gemischt |
| 20 Nutzer Audio | mehrere Clients |
| Kamera 720p | Laptop |
| Kamera 1080p | externe Webcam |
| Screenshare 1080p | normaler Monitor |
| Screenshare 4K | 4K Monitor |
| TURN UDP | restriktives NAT |
| TURN TCP/TLS | UDP blockiert |
| Paketverlust 1/3/5 % | Network Emulator |
| RTT 50/100/200 ms | Network Emulator |

---

## 36. Codex-Umsetzungsstruktur

```text
openvoice/
  apps/
    web/
      src/
        app/
        components/
        features/
          auth/
          workspaces/
          channels/
          chat/
          voice/
          settings/
        rtc/
        api/
        state/
        styles/
      tests/
    api/
      src/
        modules/
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
        db/
        config/
        security/
        observability/
      tests/
  packages/
    shared/
      src/
        types/
        permissions/
        events/
        schemas/
    eslint-config/
    tsconfig/
  infra/
    docker-compose.yml
    turnserver.conf
    livekit.yaml
    prometheus.yml
    grafana/
  docs/
    architecture.md
    api.md
    permissions.md
    rtc.md
    deployment.md
    security.md
  migrations/
  README.md
  THIRD_PARTY_NOTICES.md
```

---

## 37. Definition of Done

Ein Feature gilt nur als fertig, wenn:

- Backend validiert Rechte.
- Frontend blendet nicht erlaubte Aktionen aus.
- API gibt korrekte Fehler.
- Tests vorhanden.
- Audit Log, falls relevant.
- Rate Limit, falls relevant.
- Metrics, falls relevant.
- Dokumentation aktualisiert.
- Keine Secrets im Code.
- Keine TypeScript-`any`-Flut.
- Keine ungeprüften TODOs.
- E2E-Test oder manueller Testfall dokumentiert.
- Barrierearme Bedienung berücksichtigt.

---

## 38. Harte technische Leitlinien

1. Keine Medienlogik ohne serverseitige Rechteprüfung.
2. Keine permanenten TURN-Credentials im Browser.
3. Kein Chat über rein flüchtige DataChannels, weil Chat persistent sein muss.
4. Audio wird höher priorisiert als Video.
5. SFU statt Mesh.
6. 4K ist ein Qualitätsprofil, kein Versprechen unabhängig von Hardware/Netz.
7. Permissions sind Backend-Wahrheit.
8. Frontend-State ist Cache, keine Autorität.
9. coturn ist Pflichtbestandteil.
10. Alle Komponenten müssen self-hostbar sein.
11. Keine proprietären RTC-SaaS.
12. Monitoring ist Teil des MVP, nicht späteres Nice-to-have.

---

## 39. Kurzfassung für Codex als Startprompt

```text
Baue eine Open-Source-Web-App namens OpenVoice.

Ziel:
Discord-ähnliches, aber schlankes Voice-/Chat-/Video-Tool im Browser.

MVP:
- Auth mit Email/Passwort
- Workspaces
- Channel-Baum mit Kategorien, Text, Voice, Combined
- Rollen/Rechte mit Vererbung und Overrides
- Persistenter Chat
- WebSocket Gateway
- Voice Channels über WebRTC + SFU
- Kamera
- Screenshare bis 4K
- beste Audioqualität über Opus
- coturn für STUN/TURN mit kurzlebigen TURN REST Credentials
- PostgreSQL
- Redis/Valkey
- Prometheus Metrics
- Docker Compose

Wichtig:
- SFU statt P2P Mesh
- LiveKit self-hosted als MVP-Media-Provider, MediaProvider Interface abstrakt halten
- coturn zwingend integrieren
- keine proprietären Cloud-Dienste
- keine Sticker/GIFs/Bots/Threads im MVP
- Rechte immer serverseitig prüfen
- Audio bei Bandbreitenproblemen priorisieren
- 4K anfordern, messen, adaptiv degradieren
```

---

## 40. Quellen und technische Referenzen

Diese Referenzen sind für Codex und Entwickler hilfreich:

- coturn: https://github.com/coturn/coturn
- coturn Manpage: https://www.mankier.com/1/turnserver
- WebRTC W3C: https://www.w3.org/TR/webrtc/
- WebRTC Stats W3C: https://www.w3.org/TR/webrtc-stats/
- Screen Capture W3C: https://www.w3.org/TR/screen-capture/
- WebRTC Encoded Transform W3C: https://www.w3.org/TR/webrtc-encoded-transform/
- Opus RTP RFC 7587: https://www.rfc-editor.org/rfc/rfc7587.txt
- LiveKit GitHub: https://github.com/livekit/livekit
- mediasoup: https://mediasoup.org/
