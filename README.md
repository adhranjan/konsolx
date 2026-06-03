# Konsolx

A browser-based terminal workspace manager. Stop switching between terminal windows, directories, and env configs when working across multiple projects. Konsolx gives you **workspaces**, **environment presets**, and **quick commands** — all in one browser tab.

Every terminal you open runs **directly on your host machine** — same filesystem, same tools (`node`, `npm`, `git`, etc.), same network. The Docker container only serves the web UI.

---

## Start (Docker — recommended)

### Requirements
- Docker + Docker Compose
- Linux host with Docker Engine (Fedora, Ubuntu, Arch, etc.)

> **Docker Desktop (Mac/Windows):** `nsenter` will land in the LinuxKit VM, not your actual Mac/Windows host. Bind-mount your project directories instead — see [Standard mode](#standard-mode-isolated-terminals) below.

### One command to start

```bash
HOST_USER=$(whoami) docker compose -f docker-compose.host-shell.yml up -d
```

Open **http://localhost:8012** in your browser.

That's it. Every terminal you open in the UI is a real shell on your machine — your files, your tools, your environment.

### Stop

```bash
docker compose -f docker-compose.host-shell.yml down
```

---

## How host-shell works

The container runs with `privileged: true` and `pid: host`. When you open a terminal, the server calls `nsenter -t 1 -m -u -i -n -p` to enter the host's Linux namespaces (filesystem, network, PID, etc.), then runs `su - <your-user>` inside a PTY. The result is a shell that is indistinguishable from opening a terminal on the host directly — correct user, correct HOME, nvm/rbenv/pyenv all work.

---

## Standard mode (isolated terminals)

Terminals run inside the container. Useful if you're on Docker Desktop or want isolation.

```bash
docker compose up -d
```

To access your host files from inside terminals, bind-mount your directories in `docker-compose.yml`:

```yaml
volumes:
  - konsolx-data:/data
  - /home/youruser/projects:/home/youruser/projects
```

---

## Hack on the code (no Docker)

**Prerequisites:** Node.js 18+

```bash
git clone https://github.com/adhranjan/konsolx.git
cd konsolx
npm install
npm run dev
```

Open **http://localhost:8012**.

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
| `HOST_USER` | _(none)_ | Your Linux username. Required for host-shell mode so your shell init files load correctly. |
| `USE_HOST_SHELL` | `false` | Set to `true` to enable nsenter host-shell mode (set automatically by `docker-compose.host-shell.yml`). |
| `PORT` | `8012` | Port the server listens on. |
| `DATA_DIR` | `.` | Directory where `terminal.db` (workspaces, envs, commands) is stored. |

---

## Security note

Host-shell mode runs with `--privileged` and `--pid=host`. This gives the container full access to the host. Only run this on machines you own and trust. Do not expose port 8012 to the public internet.
