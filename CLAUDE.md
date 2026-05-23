# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Gitify is an Electron menubar/system-tray desktop app that aggregates Git notifications from multiple forges (GitHub Cloud, GitHub Enterprise, Gitea, Forgejo, Codeberg). It runs as a tray icon on macOS, Windows, and Linux.

## Commands

```bash
pnpm install          # bootstrap (takes ~2.5 min — do not cancel)
pnpm build            # production build → build/ (takes ~30s)
pnpm dev              # hot-reload dev mode (Vite + GraphQL codegen watcher)
pnpm start            # build then dev

pnpm check            # format + lint + type-check (run before committing)
pnpm check:fix        # same but auto-fixes

pnpm test             # Vitest with coverage, single run
pnpm test:watch       # watch mode
pnpm test -- src/renderer/utils/api/client.test.ts  # single file
pnpm test -u          # update snapshots after UI changes

pnpm codegen          # regenerate GraphQL types from schema
```

Pre-commit hooks (Husky + lint-staged) run automatically on `git commit`.

## Architecture

The app is split into three Electron process layers:

| Layer    | Path            | Role                                                                   |
| -------- | --------------- | ---------------------------------------------------------------------- |
| Main     | `src/main/`     | Node.js process — tray window, IPC handlers, auto-updates, lifecycle   |
| Renderer | `src/renderer/` | React 19 UI running in Chromium                                        |
| Preload  | `src/preload/`  | Bridge exposing safe main-process APIs to renderer via `contextBridge` |
| Shared   | `src/shared/`   | Types, constants, and utilities used by both main and renderer         |

### Renderer internals

- **`context/App.tsx`** — Central `AppProvider` (React Context) owns auth accounts, settings, notifications, and filter state. Most components consume this via `useAppContext()`.
- **`stores/`** — Zustand stores for persistent UI state (e.g. filters saved to localStorage).
- **`hooks/useNotifications.ts`** — Core polling loop: fetches notifications from each forge on an interval, enriches them via GraphQL, applies filters, triggers native notifications and sounds.
- **`utils/forges/`** — Forge adapter pattern. Each forge (GitHub, Gitea, …) implements a common interface so the rest of the app is forge-agnostic.
- **`utils/api/`** — Octokit REST + GraphQL clients; generated types live here after `pnpm codegen`.
- **`utils/auth/`** — OAuth app flow, device flow, and PAT login helpers.
- **`routes/`** — Page-level components (Notifications main view, Settings, Login variants, Accounts, Filters).
- **`components/`** — Feature-grouped UI: notifications, settings, filters, layout, primitives.

### Data flow

1. `AppProvider` initialises accounts from persisted storage and starts the notification polling.
2. `useNotifications` calls each forge adapter → REST fetch → GraphQL enrichment → filter/group → update context state.
3. React Router renders the tray popup: unauthenticated users see a Login route; authenticated users see the Notifications route.
4. IPC messages (via preload) let the renderer trigger native OS behaviour (open URL, show badge count, play sound, etc.).

## Technology Stack

- **Electron 42** + **menubar** — tray app
- **React 19** + **React Router 7**
- **TypeScript 6** (strict mode, ES2024 target)
- **Vite+ (`vp`)** — unified toolchain: build, dev, lint (oxlint), format (oxfmt), test (Vitest)
- **Vitest 4** — happy-dom for renderer/preload tests, node env for main/shared tests
- **Zustand 5** — persistent client state
- **Tailwind CSS 4** + **@primer/react 38** — styling and GitHub component library
- **Octokit** (REST + GraphQL) + **GraphQL Codegen** — GitHub API
- **final-form** — settings forms

## Key Constraints

- **Node >=24** is required (`engines` field in package.json). Use `.nvmrc` or `.tool-versions` to pin.
- **pnpm** only — no npm/yarn.
- Electron cannot start in headless/container environments (sandbox restriction) — expected.
- The project focuses on notification monitoring, not being a full GitHub client. Keep changes simple, minimal, and cross-platform.
- After any UI change, update snapshots with `pnpm test -u` rather than leaving them stale.
