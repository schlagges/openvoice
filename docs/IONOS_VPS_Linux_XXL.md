## VPS Server Dokumentation
**Status:** In Einrichtung | **Erstellt:** 17.03.2026

## 📋 System-Spezifikationen
- **IP:** `217.160.175.231`
- **OS:** Ubuntu 24.04 LTS (Noble Numbat)
- **CPU:** 12 vCores
- **RAM:** 24 GB
- **Disk:** 720 GB NVMe SSD
- **Standort:** Europa

---

## 🛠️ Initiales Setup Checklist
- [x] SSH-Key hinterlegen & Password-Login deaktivieren
- [x] System-Updates: `sudo apt update && sudo apt upgrade -y`
- [x] Firewall (UFW) konfigurieren: `ssh`, `http`, `https`
- [x] Docker & Docker Compose installieren

## 🛡️ Firewall & Port-Management (UFW)

| Dienst | Externer Port | Interner Port | Status |
| :--- | :--- | :--- | :--- |
| SSH | 22 | 22 | ✅ Offen |
| HTTP (Proxy) | 80 | 80 | ✅ Offen |
| HTTPS (Proxy) | 443 | 443 | ✅ Offen |
| NPM Admin UI | 81 | 81 | ❌ Geschlossen (via Proxy) |
| Portainer UI | 9443 | 9443 | ❌ Geschlossen (via Proxy) |
## 1. Root Password und Useranlage

```bash
# Root-Passwort setzen
passwd root

# Hauptbenutzer anlegen und sudo-Rechte geben
adduser luhzifer
usermod -aG sudo luhzifer
```

## 2. SSH-Konfiguration

```bash
# SSH-Verzeichnis für User 'luhzifer' vorbereiten
mkdir -p ~/.ssh
chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys # Key hinterlegen
chmod 600 ~/.ssh/authorized_keys

# SSH-Hardening (Passwort-Login abschalten)
sudo nano /etc/ssh/sshd_config
# In der Datei: PasswordAuthentication no

# Cloud-Init Overrides entfernen (wichtig für Ubuntu VPS)
sudo rm /etc/ssh/sshd_config.d/60-cloudimg-settings.conf
sudo rm /etc/ssh/sshd_config.d/50-cloud-init.conf

# SSH-Dienst neu starten & prüfen
sudo systemctl restart ssh
sudo sshd -T | grep -E "passwordauthentication|pubkeyauthentication"
```

## 3. Firewall (UFW)

Sicherung des Netzwerks durch Einschränkung der offenen Ports.

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 81/tcp    # NPM Admin (temporär)
sudo ufw allow 9443/tcp  # Portainer (temporär)
sudo ufw enable
```


## 4. Docker Installation (Ubuntu 24.04)
```bash
# Repo hinzufügen & Docker installieren
sudo apt-get update
sudo apt-get install ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
docker network create proxy-nw
```

## 5. Tools

Zusätzliche Werkzeuge für die Verwaltung

```bash
# System-Tools
sudo apt install git btop

# ACL
sudo apt install acl
sudo setfacl -R -m u:luhzifer:rwx /opt/stacks

# NVM & Node.js
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install node

# Lazydocker (Docker TUI)
curl https://raw.githubusercontent.com/jesseduffield/lazydocker/master/scripts/install_update_linux.sh | bash
sudo install .local/bin/lazydocker /usr/local/bin
```
### 🛠️ Terminal Tools & Aliases
- **btop**: System-Ressourcen (CPU/RAM) überwachen.
- **lazydocker**: Container bequem verwalten (Einfach `lazydocker` im Terminal tippen).
- **nvm**: Node.js Versionen verwalten.

**Praktische Befehle:**
- Docker aufräumen: `docker system prune -a`
- Logs live verfolgen: `docker compose logs -f`

### 📂 Verzeichnis-Struktur (Docker)
Alle Docker-Konfigurationen liegen zentral unter `/opt/stacks/`.

**Struktur:**
- `/opt/stacks/<service-name>/` -> Projektordner
- `.../docker-compose.yml` -> Die Konfigurationsdatei
- `.../data/` -> Persistente Daten des Containers

### 🛠️ Docker Management Regeln
1. **Ein Stack = Ein Ordner:** Jeder Dienst bekommt seinen eigenen Ordner in `/opt/stacks/`.
2. **Shared Network:** Alle Container, die über den Proxy erreichbar sein sollen, müssen im Netzwerk `proxy-nw` sein.
3. **Internal Routing:** Im Nginx Proxy Manager nutzt man dann einfach den `container_name` (z.B. `portainer`) als Hostname statt der IP.

## 🔗 Proxy-Routing-Tabelle
Alle Dienste laufen im Docker-Netzwerk `proxy-nw`.

| Dienst | Domain | Interner Host | Port | Besonderheiten |
| :--- | :--- | :--- | :--- | :--- |
| Portainer | `portainer.xyz.de` | `portainer` | 9443 | HTTPS Scheme, Websockets |
| NPM Admin | `npm.xyz.de` | `nginx-proxy-manager` | 81 | HTTP Scheme |

> [!TIP] Internal Hostnames
> Innerhalb von Docker kannst du statt IP-Adressen einfach die Namen der Container verwenden, solange sie im gleichen Netzwerk (`proxy-nw`) liegen.

## 🛡️ Finales Hardening & Zugriff

### Erreichbarkeit
- **NPM Admin:** `https://npm.ionos.luhzifer.net` (Port 81 extern GESCHLOSSEN)
- **Portainer:** `https://portainer.ionos.luhzifer.net` (Port 9443 extern GESCHLOSSEN)

### Lazydocker Shortcuts

| **Taste** | **Aktion**                                                     |
| --------- | -------------------------------------------------------------- |
| **Enter** | Fokus auf das rechte Fenster (Logs scrollen)                   |
| **x**     | Menü für Container-Aktionen (Stop, Restart, Remove)            |
| **s**     | Stoppt den ausgewählten Container                              |
| **r**     | Restartet den Container                                        |
| **e**     | Öffnet eine Shell (`exec`) direkt im Container                 |
| **d**     | "Prune" – Löscht alle ungenutzten Images/Container (Vorsicht!) |
| **q**     | Beendet lazydocker                                             |

# 🛡️ VPS Backup-Strategie (Pull-Prinzip)

Diese Strategie nutzt einen verschlüsselten WireGuard-Tunnel, um konsistente Datenbank-Snapshots und Anwendungsdaten vom VPS auf den heimischen Unraid-Server zu sichern, ohne das Heimnetzwerk nach außen zu exponieren.

## 1. Architektur & Konnektivität

- **Verbindung:** WireGuard Peer-to-Peer (Unraid: `10.253.0.1` | VPS: `10.253.0.19`).
    
- **Isolation:** Der VPS hat keinen Zugriff auf das lokale LAN. SSH auf dem VPS ist nur über das WireGuard-Interface (`wg0`) erlaubt.
    
- **Authentifizierung:** Dedizierter SSH-Key (ohne Passphrase) auf Unraid für die Automatisierung.
    

## 2. Sicherheitskonzept (Rechteverwaltung)

- **ACL (Access Control Lists):** Die User `luhzifer`, topf, schlagges besitzen Schreib- und Leserechte (`rwx`) für alle Unterordner in `/opt/stacks    
- **Sudo-Einschränkung:** Für Systemzugriffe (Snapshot-Erstellung) dürfen `luhzifer, topf, schlagges` via `sudo visudo` (siehe Einträge am Ende) Docker-Befehle ohne Passwort ausführen:
  `luhzifer ALL=(ALL) NOPASSWD: /usr/bin/docker`
  `topf ALL=(ALL) NOPASSWD: /usr/bin/docker`
  `schlagges ALL=(ALL) NOPASSWD: /usr/bin/docker`
## 3. Der Backup-Ablauf (Täglich)

Das Backup folgt drei Phasen:

## Phase A: Datenbank-Konsistenz (Pre-Backup)

In jedem Projektordner (`/opt/stacks/<projekt>/`) liegt eine `pre-backup.sh`. Das Master-Backup-Skript triggert diese per SSH.

- **SQLite:** Erzeugt einen konsistenten Snapshot mit dem `.backup` Befehl (verhindert WAL-Korruption).
- **Portainer (BoltDB):** Pausiert kurz den Container und kopiert die `.db` Datei.
- **Rotation:** Es werden immer die **letzten 3 Snapshots** lokal im Projektordner unter `./backups/` vorgehalten.
## Phase B: Datentransfer (Rsync)

Rsync spiegelt den gesamten Ordner `/opt/stacks/` vom VPS auf das lokale Array:

- **Befehl:** `rsync -avz --delete`
- **Inhalt:** Live-Daten, Konfigurationen (z. B. NPM-Zertifikate), Docker-Compose-Dateien und die in Phase A erzeugten Datenbank-Snapshots.
## Phase C: Langzeit-Archivierung (Optional)

Die gespiegelten Daten auf Unraid können nun in die normale Unraid-Backup-Routine (z. B. Restic oder Cloud-Backup) einfließen.

## 4. Disaster Recovery (Wiederherstellung)

1. **Dateien:** Den entsprechenden Projektordner aus dem Backup zurück auf den VPS kopieren.
    
2. **Datenbank:** * Die aktuellste Datei aus dem Unterordner `backups/` wählen.
    
    - In den ursprünglichen Datenbanknamen umbenennen (z. B. `recipee.db`).
        
    - In den `data/` Ordner verschieben.
        
3. **Start:** `docker compose up -d`.
