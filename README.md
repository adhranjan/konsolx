# Konsolx

> **If you work on multiple Node.js services and keep losing track of which terminal is which — or you're constantly re-exporting env vars — Konsolx fixes that.**

A browser-based terminal workspace manager built for developers who juggle multiple services, directories, and environment configs every day.

One browser tab. All your terminals. All your envs. Zero context switching.

![Konsolx](https://img.shields.io/badge/docker-ghcr.io%2Fadhranjan%2Fkonsolx-blue?logo=docker)

---

## The problem

You're working on a Node.js project with a backend, a frontend, a worker, and a database. You have:
- 5 terminal windows open, none of them labelled
- Different `NODE_ENV`, `DATABASE_URL`, `API_KEY` in each one
- A script you run 10 times a day that you keep re-typing

Konsolx solves all three.

---

## Quick Start

**Requirements:** Docker + Docker Compose on Linux.

```bash
# Download the compose file
curl -O https://raw.githubusercontent.com/adhranjan/konsolx/main/docker-compose.yml

# Start
HOST_USER=$(whoami) docker compose up -d
```

Open **http://localhost:8012**

That's it. No install, no config, no account.

### Custom port

```bash
PORT=9000 HOST_USER=$(whoami) docker compose up -d
```

### Dev mode (enables browser DevTools)

```bash
KONSOLX_ENV=dev HOST_USER=$(whoami) docker compose up -d
```

### Stop

```bash
docker compose down
```

---

## Features

| Feature | What it does |
|---|---|
| **Workspaces** | Save a group of directories. One click opens all of them as labelled, color-coded tabs. |
| **Environments** | Named sets of env vars. Apply to any terminal in one click. Import/export `.env` files. |
| **Quick Commands** | Save `npm run dev`, `docker compose up`, anything. One click runs it in the current tab or a new one. Organized by group. |
| **Tab groups** | Tabs from the same workspace are color-coded so you always know which project you're in. |
| **Per-tab env overrides** | Override specific env vars for a single tab without affecting others. |
| **Kill Port** | Kill whatever is running on a port — directly from the UI. |
| **Real host shell** | Terminals run on your actual machine. `nvm`, `rbenv`, `pyenv`, your PATH — all work correctly. |

---

## How it works

The container runs with `privileged: true` and `pid: host`. When you open a terminal, the server uses `nsenter` to enter the host's Linux namespaces, then runs `su - <your-user>` inside a PTY. The result is a real shell on your host — correct user, correct HOME, `nvm` and all your tools load as normal.

> **Docker Desktop (Mac/Windows):** `nsenter` targets the LinuxKit VM, not your actual host. Host-shell will not behave as expected on Docker Desktop.

---

## Configuration

| Env var | Default | Description |
|---|---|---|
| `HOST_USER` | _(required)_ | Your Linux username. Terminals start as this user so your shell init files load correctly. |
| `PORT` | `8012` | Port the server listens on. |
| `DATA_DIR` | `/data` | Where `terminal.db` (workspaces, envs, commands) is stored. |
| `KONSOLX_ENV` | `release` | Set to `dev` to enable browser DevTools. |

---

## Hack on it

```bash
git clone https://github.com/adhranjan/konsolx.git
cd konsolx
npm install
npm run dev
```

Open **http://localhost:8016** (or whatever `PORT` is set to in `.env`).

---

## Security note

Konsolx runs with `--privileged` and `--pid=host`, giving the container full access to the host. Only run this on machines you own and trust. Do not expose it to the public internet.
