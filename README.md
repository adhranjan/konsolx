# Konsolx

> **If you work on multiple Node.js services and keep losing track of which terminal is which — or you're constantly re-exporting env vars — Konsolx fixes that.**

A desktop terminal workspace manager built for developers who juggle multiple services, directories, and environment configs every day.

One window. All your terminals. All your envs. Zero context switching.

---

## The problem

You're working on a Node.js project with a backend, a frontend, a worker, and a database. You have:
- 5 terminal windows open, none of them labelled
- Different `NODE_ENV`, `DATABASE_URL`, `API_KEY` in each one
- A script you run 10 times a day that you keep re-typing

Konsolx solves all three.

---

## Quick Start

**Requirements:** Linux (Fedora, Ubuntu, Arch, etc.)

```bash
git clone https://github.com/adhranjan/konsolx.git
cd konsolx
npm install
npm run build
npm run electron:dev
```

Or download the latest `.AppImage` / `.rpm` from [Releases](https://github.com/adhranjan/konsolx/releases) and run it directly — no install needed.

---

## Features

| Feature | What it does |
|---|---|
| **Workspaces** | Save a group of directories. One click opens all of them as labelled, color-coded tabs. |
| **Environments** | Named sets of env vars. Apply to any terminal in one click — injected live without restarting. |
| **Quick Commands** | Save `npm run dev`, `git pull`, anything. One click runs it in the current tab or a new one. |
| **Tab groups** | Tabs from the same workspace are color-coded so you always know which project you're in. |
| **Per-tab env overrides** | Override specific env vars for a single tab without affecting others. |
| **Kill Port** | Kill whatever is running on a port — directly from the UI. |
| **Persistent sessions** | Close the window, sessions keep running. Re-open and pick up where you left off. |

---

## How it works

Konsolx is an Electron app that bundles an Express server + React frontend. When you open a terminal, it spawns a real PTY shell on your machine using `python3 pty.spawn` — correct user, correct `$HOME`, `nvm` and all your tools load as normal.

---

## Konsolx vs Warp

They aren't really competitors. **Warp is a better terminal. Konsolx is a better dev-context manager** that happens to render terminals. Warp makes *typing commands* nicer; Konsolx makes *juggling 15 services* — their repos, envs, and running processes — manageable and private.

| Scope | Warp | Konsolx | Who's better & why |
|---|---|---|---|
| **Privacy of data** | Env vars, commands, DB URLs synced to Warp's cloud | 100% local SQLite, zero outbound calls | **Konsolx** — your secrets never leave the machine |
| **Account** | Login required | None | **Konsolx** — no signup, no identity |
| **Cost** | Free tier + paid plans | Free, no tiers | **Konsolx** — no subscription |
| **Offline** | Needs connectivity for AI/sync | Fully offline | **Konsolx** — works on a plane |
| **Multi-repo workspaces** | Manual, per-tab | One click opens N repos as labelled, color-coded tabs | **Konsolx** — built for it |
| **Live env injection** | No | Swap env var sets into a *running* shell, no restart | **Konsolx** — unique |
| **Per-tab env overrides** | No | Yes | **Konsolx** |
| **Pinned log lines** | No | Pin a line, flash-jump back to it while debugging | **Konsolx** — unique |
| **Persistent sessions** | Per-app | Server-side — close the window, shells live on | **Konsolx** |
| **Quick commands** | AI suggests generic commands | You curate project-specific ones | **Tie** — different philosophy |
| **Sharing setups** | Cloud "Drive" — live, account-bound, hosted by Warp | Export workspaces/envs/commands as JSON → commit to git → teammates import | **Tie** — Warp = live cloud sync; Konsolx = git-versioned config you own and review in PRs |
| **AI command search** | Powerful agent | None (by design) | **Warp** — owns this lane |
| **Rendering / speed** | GPU-native, buttery | xterm.js in Electron, heavier | **Warp** — far smoother |
| **Command blocks** | Collapse, re-run, share | No | **Warp** |
| **Cross-platform** | Mac, Linux, Windows | Linux only (for now) | **Warp** |
| **Maturity / polish** | Funded team, years of QA | Solo, young, rough edges | **Warp** |
| **Hackability** | Closed source | Open, self-hostable | **Konsolx** |

**Pick Konsolx if** you want your repos, envs, and secrets organized in one private, offline, free place.
**Pick Warp if** you want the slickest, AI-assisted place to type commands and don't mind the cloud.

> ⚠️ **Sharing safely:** exported JSON includes env var *values*. When committing a shared `workspaces.json` to git, keep secrets out — export workspaces and commands, and leave secret values empty (use placeholders teammates fill in locally).

---

## Building from source

```bash
git clone https://github.com/adhranjan/konsolx.git
cd konsolx
npm install

# Development (auto-reloads on change)
npm run dev

# Build + run as desktop app
npm run electron:dev

# Package as .AppImage / .rpm
npm run electron:build
# Output in ./release/
```

---

## Configuration

| Env var | Default | Description |
|---|---|---|
| `PORT` | `8016` | Port the internal server listens on. |
| `DATA_DIR` | `~/.config/konsolx/konsolx-data` | Where `terminal.db` is stored. |
| `NODE_ENV` | `production` | Set to `development` to enable DevTools. |
