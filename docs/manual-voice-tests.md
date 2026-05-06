# Manual Voice Tests

Phase 5 implements the audio-only Voice MVP. Camera video, screenshare, recording and bots are out
of scope.

## Local Setup

1. Start the stack:

   ```bash
   docker compose --env-file .env.example -f infra/docker-compose.yml up --build
   ```

2. Open `http://localhost:5173` in two browsers or two isolated browser profiles.
3. Register/login users through the API or an API client, create a workspace and create one voice
   channel.
4. Store the returned CSRF token in each browser profile with
   `sessionStorage.setItem("openvoice.csrfToken", csrfToken)` for the temporary Phase-5 voice
   controls.

## Checks

- Join the same voice channel from two browsers; both should connect to the same LiveKit room.
- Speak from browser A and verify audio is received in browser B.
- Toggle self mute; browser B must stop receiving browser A's microphone.
- Toggle self deafen; browser A must stop publishing microphone audio.
- Call server mute for browser A through `POST /api/v1/workspaces/:workspaceId/voice/server-mute`;
  browser A must lose publish permission and its microphone track must be muted by the SFU.
- Call server deafen through `POST /api/v1/workspaces/:workspaceId/voice/server-deafen`; state must
  update and publish must remain disabled.
- Deny `CONNECT_VOICE` through a channel permission override and verify join returns `403`.
- Deny `SPEAK` while allowing `CONNECT_VOICE`; join must succeed with `canPublishAudio: false`.
- Fetch `/api/v1/turn/credentials`; the response must include STUN, TURN UDP, TURN TCP and TURNS.

## Known Phase-5 Limits

- The temporary web controls assume an existing authenticated cookie and CSRF token.
- No camera, screenshare, recording, bots or additional RTC features are implemented.
- TURNS in local Compose uses development placeholders; production requires valid coturn TLS
  certificates and real secrets outside Git.
