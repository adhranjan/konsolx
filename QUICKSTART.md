# Konsolx — Quick Start

Konsolx runs as a Docker container. Open **http://localhost:8012** in your browser after starting.

---

## Host-shell mode (recommended for Linux)

Terminals opened in the UI run **directly on your host machine** — same filesystem, same tools
(`node`, `npm`, `git`, etc.), same network. The container only serves the web UI.

**Requirements:** Linux with Docker Engine (Fedora, Ubuntu, Arch, etc.).
Does *not* give you the real host on Docker Desktop (Mac/Windows) — see the bind-mount option below instead.

```bash
# Pull and start
docker compose -f docker-compose.host-shell.yml up -d

# Open
open http://localhost:8012   # or just visit in browser

# Stop
docker compose -f docker-compose.host-shell.yml down
```

### Why it works

`privileged: true` + `pid: host` lets the server call `nsenter(1)` to enter all host Linux namespaces
(mount, PID, network, UTS, IPC). Every terminal you open is a real shell on the host, showing the host
filesystem, running processes, and installed tools.

---

## Standard mode (isolated container terminals)

Terminals run inside the container. Useful on Docker Desktop or when you want isolation.

```bash
docker compose up -d
```

To access host directories from terminals, uncomment the volume bind-mount in `docker-compose.yml`
and add the path to Docker Desktop → Settings → Resources → File sharing.

---

## Build from source

```bash
# Clone and build locally
git clone https://github.com/adhranjan/konsolx.git
cd konsolx
docker compose -f docker-compose.host-shell.yml up -d --build
```

---

## Hack on the code (no Docker)

```bash
npm install
npm run dev        # UI + server on http://localhost:8012
```

---

## Image tags (ghcr.io/adhranjan/konsolx)

| Tag | When pushed |
|-----|-------------|
| `latest` | Every push to `main` |
| `v1.2.3` | Git tag `v1.2.3` |
| `1.2` | Git tag `v1.2.x` |

To make the image publicly pullable without `docker login`: GitHub → your profile →
**Packages → konsolx → Package settings → Change visibility → Public**.
