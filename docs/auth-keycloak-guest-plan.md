# Keycloak and Guest Invite Auth Plan

Status: Draft for the post-rc auth migration.

## Goal

OpenVoice authentication should move from local email/password accounts and
application-owned login cookies to Keycloak as the identity provider. Direct
invite links must still allow guests to enter a workspace without a full account.
Guests only choose a display name, join the invited workspace, and may link a
Keycloak login later.

## Current Host Check

Checked on 2026-05-06:

- Keycloak is running on the host as `keycloak-sso-keycloak-1`.
- The public issuer base is `https://auth.schnick-schnack.info`.
- The `master` realm discovery endpoint works.
- The configured realm is
  `https://auth.schnick-schnack.info/realms/schnick-schnack`.
- The discovery endpoint for `schnick-schnack` works and returns issuer
  `https://auth.schnick-schnack.info/realms/schnick-schnack`.

The app should therefore use the shared `schnick-schnack` realm for now.

## Product Rules

- No public OpenVoice self-registration.
- Login is only useful after an invited user has entered a workspace or when a
  user already has workspace membership.
- Direct invite links remain the primary guest entry path.
- Invite links expire after 5 minutes.
- Guest join requires only a display name.
- Guests receive only server-side workspace membership and roles. Frontend state
  is never a security boundary.
- Guests can later link to a Keycloak identity without losing their workspace
  membership.
- Legacy local email/password login and registration must be disabled outside
  explicit local development mode.

## Target Auth Model

OpenVoice should distinguish three concepts:

| Concept          | Responsibility                                                       |
| ---------------- | -------------------------------------------------------------------- |
| Keycloak user    | External authenticated identity for registered users.                |
| OpenVoice user   | Application principal used for ownership, membership and audit logs. |
| Workspace member | User's role-bound membership inside one workspace.                   |

Recommended user fields:

| Field                 | Purpose                                                      |
| --------------------- | ------------------------------------------------------------ |
| `kind`                | `guest` or `registered`.                                     |
| `keycloakSubject`     | Stable Keycloak `sub` for registered users, null for guests. |
| `displayName`         | User-visible name.                                           |
| `email`               | Optional for Keycloak users; guests should not need one.     |
| `createdFromInviteId` | Audit/debug link to the invite that created the guest.       |
| `linkedAt`            | Timestamp when a guest became a registered user.             |

## Token Strategy

For registered users:

- Browser performs Keycloak Authorization Code with PKCE.
- API accepts `Authorization: Bearer <keycloak-access-token>`.
- API verifies issuer, audience, signature through JWKS, `exp`, `nbf`, and
  subject.
- API maps Keycloak `sub` to an OpenVoice user.

For guests:

- Invite join returns a short-lived OpenVoice guest access token.
- The token is scoped to the created guest user and workspace membership.
- The token is not a Keycloak token and must not grant admin capabilities.
- The token should be stored in memory or session storage, not long-term local
  storage.

Cookie note:

- The current OpenVoice session cookie must stop being the login mechanism for
  production.
- Cookies may still exist for unrelated deployment concerns such as temporary
  Basic Auth at a reverse proxy, but API authorization should not depend on the
  old email/password session cookie path.

## Invite Flow

### Create Invite

- Auth required.
- `MANAGE_INVITES` required server-side.
- Code generated with high entropy.
- Only a hash of the code is stored.
- Expires at `now + 5 minutes`.
- Prefer single-use invites for security. If multi-use invites are needed later,
  add explicit `maxUses` and `uses` fields.
- Audit `workspace.invite.created`.

### Guest Join

Endpoint shape:

```text
POST /api/v1/invites/:code/guest-join
```

Input:

```json
{
  "displayName": "BoLuTo1234"
}
```

Behavior:

- No existing login required.
- Validate invite hash and expiry.
- Reject expired, revoked or fully used invites.
- Create or reuse a guest OpenVoice user for this invite redemption.
- Add workspace membership with the default guest/member role according to the
  workspace policy.
- Return workspace, member, visible channels and a short-lived guest token.
- Audit `workspace.invite.redeemed` and `workspace.guest.joined`.

### Login or Link Later

After guest join:

- UI offers `Anmelden` or `Konto verknüpfen`.
- Keycloak login redirects back with PKCE.
- API verifies the Keycloak token.
- API links the existing guest principal to `keycloakSubject`, or merges into an
  existing OpenVoice user only if this is safe and auditable.
- Audit `auth.guest.linked`.

## Keycloak Configuration

Realm:

- Name: `openvoice`.
- Self-registration disabled for the general public unless explicitly desired in
  Keycloak. OpenVoice itself should still require an invite/membership before
  granting app access.

Client:

- Client ID: `openvoice-web`.
- Use Authorization Code with PKCE.
- Public client is acceptable for a browser SPA if the API validates access
  tokens. A confidential backend client can be added later if a backend callback
  flow is preferred.
- Valid redirect URIs:
  - `https://voice.schnick-schnack.info/*`
  - local development origins used by Vite/Compose
- Web origins:
  - `https://voice.schnick-schnack.info`
  - local development origins used by Vite/Compose

Environment variables:

```text
OIDC_ISSUER_URL=https://auth.schnick-schnack.info/realms/schnick-schnack
OIDC_CLIENT_ID=openvoice-web
OIDC_AUDIENCE=openvoice-web
GUEST_TOKEN_SECRET=<secret>
INVITE_TTL_SECONDS=300
LOCAL_PASSWORD_AUTH_ENABLED=false
```

No Keycloak client secrets or token signing secrets belong in the repository.

## API Migration Steps

1. Add OIDC/JWKS token verification in the API.
2. Extend the user model for guest and Keycloak-linked users.
3. Add migrations for invite TTL/use tracking and guest identity fields.
4. Add guest join endpoint that does not require existing auth.
5. Change invite TTL from 24 hours to 5 minutes.
6. Disable `/api/v1/auth/register` and `/api/v1/auth/login` unless
   `LOCAL_PASSWORD_AUTH_ENABLED=true`.
7. Update `/api/v1/me`, REST APIs, message WebSockets and Gateway identify to
   accept Keycloak bearer tokens and guest tokens.
8. Keep all permission checks based on OpenVoice workspace membership, not
   Keycloak realm roles.
9. Add audit events for invite creation, guest join, failed invite join, token
   verification failure and guest-to-Keycloak linking.

## UI Migration Steps

1. Invite link opens a friendly landing view for the target workspace.
2. Guest path asks only for display name.
3. Existing login entry points redirect to Keycloak.
4. After guest join, show the workspace and channel immediately.
5. Offer a non-blocking `Konto verknüpfen` action.
6. Explain expired invite links clearly and offer retry/request-new-invite
   guidance.

## Security Requirements

- Server verifies every token.
- Server remains authoritative for workspace membership and permissions.
- Invite codes are random, short-lived, hashed at rest and rate-limited.
- Guest tokens are short-lived, scoped and revocable.
- No old OpenVoice password login in production.
- No secrets in repository or frontend bundles.
- Keycloak realm roles must not bypass OpenVoice permissions.
- Workspace names, private channel names and member lists must not leak through
  invalid or expired invite previews.

## Tests Required

- OIDC token verification accepts valid issuer/audience and rejects wrong
  issuer, wrong audience, expired token and unknown subject.
- Local password register/login are disabled when
  `LOCAL_PASSWORD_AUTH_ENABLED=false`.
- Invite expiry is 5 minutes.
- Expired invites cannot be joined.
- Guest can join with display name only.
- Guest receives only expected default permissions.
- Guest cannot see private channels.
- Guest can link a Keycloak login and keep membership.
- Gateway and message WebSockets accept the new auth modes without leaking
  private events.
- Audit log contains invite created, guest joined and guest linked events.
