# Runbox

A tiny desktop and terminal launcher for local development projects.

Runbox remembers each project directory and start command, then gives you one shared control plane:

- click **Run / Stop** in the desktop app;
- see whether a project is actually running;
- read recent output without finding the right terminal tab;
- use the same entries from Terminal with `p my-project`;
- keep processes running when the desktop window is closed.

The interface is deliberately quiet: a compact, terminal-inspired dashboard without Docker or a heavyweight embedded browser.

## Quick start

### Desktop app

Requirements: macOS, [Node.js](https://nodejs.org/), [pnpm](https://pnpm.io/), Rust, and the Xcode Command Line Tools.

```bash
pnpm install
pnpm app:dev
```

Build an installable app:

```bash
pnpm app:build
```

The macOS app and DMG are written to `target/release/bundle/`.

### Terminal command

Install the companion `p` command:

```bash
pnpm cli:install
```

Make sure `~/.cargo/bin` is in `PATH`, then:

```bash
p                         # list every project and its status
p my-web                  # start by name
p start my-web
p stop my-web
p logs my-web
p logs my-web --follow
p add ~/Projects/my-web
p remove my-web
```

The desktop app and CLI read the same project list, runtime state, and logs.

## How commands run

Every command runs:

1. inside the configured project directory;
2. through the user's login shell;
3. in its own process group so **Stop** also stops child processes;
4. with stdout and stderr appended to the project's Runbox log.

This keeps tools configured through `.zshrc`, NVM, Homebrew, pnpm, and similar shell setup available to projects.

> Runbox executes the command you save. Only add projects and commands you trust.

## Automatic command detection

When a folder is selected, Runbox inspects common project files:

- `package.json` plus pnpm/npm/yarn/bun lockfiles;
- `justfile`;
- Docker Compose files;
- `Cargo.toml`;
- `pyproject.toml`.

The detected command is always editable before saving.

## Local data

Runbox keeps machine-specific paths and logs out of Git. On macOS they live in:

```text
~/Library/Application Support/Runbox/
├── projects.json
├── logs/
└── runtime/
```

## Stack

- Tauri 2 / Rust for process and filesystem control
- React 19 / TypeScript / Vite for the UI
- One small Rust core shared by the desktop app and CLI

## 中文说明

Runbox 就是“项目指令收藏夹”：在 App 里添加项目目录和启动命令，以后点一下即可启动或停止，也能查看状态和日志。安装终端命令后，还可以直接运行 `p 项目名`。两种入口共用同一份配置。

不需要 Docker。Docker 仍然可以作为某个项目的具体命令，例如 `docker compose up`。

## License

MIT
