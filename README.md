# Konsolx

A browser-based terminal workspace manager. Stop switching between terminal windows, directories, and env configs when working across multiple projects. Konsolx gives you **workspaces**, **environment presets**, and **quick commands** — all in one browser tab.

Every terminal you open runs **directly on your host machine** — same filesystem, same tools (`node`, `npm`, `git`, etc.), same network. The Docker container only serves the web UI.

---

## Start

**Requirements:** Docker + Docker Compose on a Linux machine.

### 1. Get the compose file

```bash
curl -O https://raw.githubusercontent.com/adhranjan/konsolx/main/docker-compose.yml
```

Or clone the repo:

```bash
git clone https://github.com/adhranjan/konsolx.git
cd konsolx
```

### 2. Pull the latest image

```bash
docker pull ghcr.io/adhranjan/konsolx:latest
```

### 3. Start

```bash
HOST_USER=$(whoami) docker compose up -d
```

Open **http://localhost:8012** in your browser.

### Custom port

```bash
PORT=9000 HOST_USER=$(whoami) docker compose up -d
```

Open **http://localhost:9000**.

### Stop

```bash
docker compose down
```

---

## How it works

The container runs with `privileged: true` and `pid: host`. When you open a terminal, the server uses `nsenter -t 1 -m -u -i -n -p` to enter the host's Linux namespaces, then runs `su - <your-user>` inside a PTY. The result is a real shell on your host — correct user, correct HOME, nvm/rbenv/pyenv all work.

> **Docker Desktop (Mac/Windows):** `nsenter` targets the LinuxKit VM, not your actual host. Host-shell will not behave as expected on Docker Desktop.

---

## Features

| Feature | What it does |
|---|---|
| **Workspaces** | Save a group of directories. One click opens all of them as tabs. |
| **Environments** | Named sets of env vars. Apply to any tab. Import/export `.env` files. |
| **Quick Commands** | Save a command (e.g. `npm run dev`). One click spawns a new tab and runs it. |
| **Tab groups** | Tabs from the same workspace are color-coded so you always know which project you're in. |
| **Per-tab env overrides** | Override specific env vars for a single tab without affecting others. |

---

## Configuration

| Env var | Default | Description |
|---|---|---|
| `HOST_USER` | _(required)_ | Your Linux username. Terminals start as this user so your shell init files (nvm, etc.) load correctly. |
| `PORT` | `8012` | Port the server listens on. |
| `DATA_DIR` | `/data` | Where `terminal.db` (workspaces, envs, commands) is stored. |

---

## Hack on the code

```bash
git clone https://github.com/adhranjan/konsolx.git
cd konsolx
npm install
npm run dev
```

Open **http://localhost:8012**.

---

## Security note

Konsolx runs with `--privileged` and `--pid=host`, giving the container full access to the host. Only run this on machines you own and trust. Do not expose port 8012 to the public internet.
