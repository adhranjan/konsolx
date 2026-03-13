# Konsolx

A browser-based terminal manager. Open multiple terminal tabs, manage workspaces, environment presets, and quick commands — all from a single web UI.

---

## Running with Docker (recommended — full host access)

This is the primary way to run Konsolx. When launched via Docker Compose with the default config, every terminal in the UI runs **inside the host machine's namespaces** using `nsenter`. This means:

- Full access to the **host filesystem** (you see `/` as it is on the host)
- Full access to **host binaries** (`git`, `node`, `python`, build tools — whatever is on the host)
- Full access to the **host network** (ports, interfaces, DNS exactly as on the host)
- Ability to see and interact with **host processes**

### Requirements

- Docker and Docker Compose installed on the host
- Linux host (or Linux VM — Docker Desktop on macOS/Windows targets the VM, not the physical machine)

### Start

```bash
docker compose up -d
```

Then open **http://localhost:3000** in your browser and click **New Terminal**.

### How it works

The container runs with `pid: host` and `privileged: true`. When a terminal session starts, the server uses `nsenter -t 1 -m -u -i -n -p` to enter all of PID 1's namespaces (mount, UTS, IPC, network, PID). The shell you get is literally running inside the host's environment.

### Persistence

Workspace, environment, and quick command settings are stored in `terminal.db` in the same directory as the `docker-compose.yml`. This file is bind-mounted into the container so your settings survive container restarts and rebuilds.

### Change the port

Edit the `ports` line in `docker-compose.yml`:

```yaml
ports:
  - "8080:3000"   # access at http://localhost:8080
```

---

## Running locally (dev mode)

**Prerequisites:** Node.js 20+

```bash
npm install
npm run dev
```

Open **http://localhost:5000**. In this mode terminals run inside the local container, not the host.
