# Keycloak Configuration for OpenVoice

Diese Datei beschreibt die Keycloak-Konfiguration fuer OpenVoice. Sie ist fuer den separaten
Keycloak-Prozess gedacht und enthaelt bewusst keine Secrets.

## Realm

- Realm name: `schnick-schnack`
- Issuer: `https://auth.schnick-schnack.info/realms/schnick-schnack`
- Discovery URL:
  `https://auth.schnick-schnack.info/realms/schnick-schnack/.well-known/openid-configuration`
- Self registration: disabled
- OpenVoice-Zugriff wird nicht allein durch einen Keycloak-Account gewaehrt. Ein Nutzer muss in
  OpenVoice eine Workspace-Mitgliedschaft haben oder ueber einen Invite-Link als Gast beitreten und
  danach sein Keycloak-Konto verknuepfen.

## OpenVoice Client

- Client ID: `openvoice`
- Client type: confidential
- Client authentication: enabled
- Standard flow: enabled
- Direct access grants: disabled
- PKCE method: `S256`
- Client secret: nur runtime setzen, niemals ins Repository schreiben

## Redirect URIs

Diese Redirect URIs muessen am Client `openvoice` erlaubt sein:

```text
https://voice.schnick-schnack.info/api/v1/auth/oidc/callback
http://localhost:5173/api/v1/auth/oidc/callback
http://localhost:55180/api/v1/auth/oidc/callback
```

Falls lokal ueber `127.0.0.1` statt `localhost` getestet wird, die passenden Varianten ebenfalls
eintragen:

```text
http://127.0.0.1:5173/api/v1/auth/oidc/callback
http://127.0.0.1:55180/api/v1/auth/oidc/callback
```

## Web Origins

Diese Web Origins muessen am Client `openvoice` erlaubt sein:

```text
https://voice.schnick-schnack.info
http://localhost:5173
http://localhost:55180
```

Falls lokal ueber `127.0.0.1` getestet wird:

```text
http://127.0.0.1:5173
http://127.0.0.1:55180
```

## Roles

- Client role am Client `openvoice`: `user`
- Testuser muessen die Client Role `openvoice:user` erhalten.
- Keycloak-Rollen ersetzen keine OpenVoice-Rechte. Workspace-Rollen, Channel-Rechte und
  Permission-Overrides bleiben serverseitig in OpenVoice massgeblich.
- User ohne `openvoice:user` muessen beim OpenVoice-OIDC-Callback abgelehnt werden.
- Globale OpenVoice-Workspaces sind keine Keycloak-Gruppen. Keycloak liefert nur den
  registrierten Login-Status; OpenVoice speichert die tatsaechliche Workspace-Mitgliedschaft.
- Gaeste ohne Keycloak-Link duerfen globale Workspaces nicht betreten.

## OpenVoice Runtime Environment

Produktionswerte fuer die OpenVoice `.env` oder den Server-Secret-Storage:

```env
LOCAL_PASSWORD_AUTH_ENABLED=false
OIDC_ENABLED=true
OIDC_ISSUER=https://auth.schnick-schnack.info/realms/schnick-schnack
OIDC_CLIENT_ID=openvoice
OIDC_CLIENT_SECRET=<runtime-secret>
OIDC_CALLBACK_URL=https://voice.schnick-schnack.info/api/v1/auth/oidc/callback
OIDC_AUDIENCE=openvoice
OIDC_REQUIRED_CLIENT_ROLE=user
INVITE_TTL_SECONDS=300
```

Lokale Browser-Tests koennen dieselbe Keycloak-Instanz verwenden, muessen aber die lokale Callback
URL passend setzen:

```env
OIDC_CALLBACK_URL=http://localhost:55180/api/v1/auth/oidc/callback
```

## Expected Auth Flows

### Existing Or Linked User

1. Nutzer klickt in OpenVoice auf Login.
2. OpenVoice leitet zu Keycloak.
3. Keycloak authentifiziert den Nutzer.
4. Keycloak leitet zu `/api/v1/auth/oidc/callback` zurueck.
5. OpenVoice verifiziert Token-Signatur, Issuer, Audience und `openvoice:user`.
6. OpenVoice setzt die normale OpenVoice-Session, wenn der Keycloak-Subject bereits verknuepft ist
   oder sicher einer bestehenden OpenVoice-Identitaet zugeordnet werden kann.
7. OpenVoice fuegt den User automatisch allen Workspaces mit
   `accessMode=global_authenticated` hinzu.

### Guest Invite

1. Nutzer oeffnet einen OpenVoice-Invite-Link.
2. Nutzer waehlt nur einen Anzeigenamen.
3. OpenVoice erstellt einen Guest-Principal und Workspace-Membership.
4. Keycloak ist fuer diesen initialen Gastbeitritt nicht erforderlich.
5. Der Gast kann danach ueber `Konto verknuepfen` den Keycloak-Login starten.
6. Nach erfolgreichem Callback wird der bestehende OpenVoice-Guest mit dem Keycloak-Subject
   verknuepft.

### Account Deletion

- Die Loeschung des Keycloak-Users soll ueber die Keycloak Account Console oder den Keycloak
  Adminbereich erfolgen.
- OpenVoice darf daraus keine automatische Rechteausweitung ableiten.
- OpenVoice muss bei einem geloeschten oder nicht mehr gueltigen Keycloak-User den naechsten Login
  ablehnen, sofern Keycloak kein gueltiges Token mehr ausstellt.

## Required Tests

- Discovery URL ist erreichbar und liefert den erwarteten Issuer.
- OpenVoice Login redirectet zu Keycloak.
- Keycloak Callback landet wieder bei OpenVoice.
- User mit `openvoice:user` kann eine bestehende oder verknuepfte OpenVoice-Identitaet nutzen.
- User ohne `openvoice:user` wird abgelehnt.
- Gast kann per Invite-Link ohne Keycloak beitreten.
- Gast kann danach sein Keycloak-Konto verknuepfen.
- Invite-Link laeuft nach 5 Minuten ab.
- Registrierter Keycloak-User tritt globalem Workspace automatisch bei.
- Gast kann globalem Workspace weder per Invite noch direkt beitreten.
- Keycloak-User kann ueber Keycloak geloescht werden.
- Nach geloeschtem Keycloak-User ist kein neuer OpenVoice-Login mit diesem User moeglich.

## Security Notes

- Keine Keycloak Client Secrets, Admin-Passwoerter, Tokens oder privaten Schluessel ins Repository
  schreiben.
- OpenVoice akzeptiert nur serverseitig verifizierte OIDC-Tokens.
- Keycloak-Realm- oder Client-Rollen duerfen OpenVoice-Workspace-Permissions nicht umgehen.
- Direkte Invite-Links bleiben kurzlebig und muessen serverseitig validiert werden.
