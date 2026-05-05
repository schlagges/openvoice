# Manuelle Phase-6-Video-Tests

Diese Schritte ergänzen `docs/manual-voice-tests.md` und prüfen nur Kamera und Screenshare.

## Voraussetzungen

- Lokale Compose-Umgebung läuft mit API, Web, LiveKit und coturn.
- Zwei Browser oder Profile sind angemeldet.
- Beide Nutzer sind im gleichen Voice- oder Combined-Channel.
- Beide Nutzer haben `VIEW_CHANNEL` und `CONNECT_VOICE`.

## Kamera

1. Nutzer A tritt dem Voice Channel bei.
2. Nutzer A aktiviert Kamera mit Profil `720p`.
3. Nutzer B sieht den Kamerastream im Video Grid.
4. Nutzer A deaktiviert Kamera.
5. Nutzer B sieht keinen aktiven Kamerastream mehr.
6. Test mit Profil `1080p` wiederholen.

## Screenshare

1. Nutzer A aktiviert Screenshare mit Profil `1080p` und Modus `detail`.
2. Browser-Auswahldialog muss sichtbar erscheinen.
3. Nutzer B sieht den Screenshare im Video Grid.
4. Nutzer A beendet Screenshare über den Browser-Indikator.
5. OpenVoice setzt `screenShareEnabled` zurück.

## 4K-Profil

1. Nutzer ohne `SHARE_SCREEN_4K` versucht Screenshare-Profil `4k`.
2. API muss `403` liefern und der Client darf keinen 4K-Screenshare starten.
3. `SHARE_SCREEN_4K` für den Nutzer oder seine Rolle erlauben.
4. Screenshare-Profil `4k` erneut starten.
5. Client muss 3840x2160 als Zielprofil anfragen; Browser/SFU dürfen adaptiv degradieren.

## Adaptive Subscription

1. Zwei Videoquellen parallel starten, eine Kamera und einen Screenshare.
2. Ein Video per Focus View fokussieren.
3. Netzwerk drosseln.
4. Audio muss stabil bleiben.
5. Nicht fokussierte oder nicht sichtbare Videos dürfen niedriger abonniert oder pausiert werden.

## Rechtefälle

1. `STREAM_CAMERA` per Channel Override verweigern.
2. Kamera-Start muss mit `403` scheitern.
3. `SHARE_SCREEN` per Channel Override verweigern.
4. Screenshare-Start muss mit `403` scheitern.
