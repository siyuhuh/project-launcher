# Runbox

A tiny desktop and terminal launcher for local development projects.

Runbox remembers each project directory and start command, then gives you one shared control plane:

- click **Run / Stop** in the desktop app;
- see whether a project is actually running;
- read recent output without finding the right terminal tab;
- pin the few projects you use every day and sort by last opened, name, or manual order;
- filter by status or project tool and see when each project was last opened;
- switch between comfortable cards, compact cards, and a Notion-style table;
- inspect each project's Git branch, clean/changed state, and ahead/behind counts;
- review diffs, stage files, commit, switch branches, and sync a repository without leaving Runbox;
- draft commit messages with a local Ollama model, Codex CLI, or Cursor Agent;
- mirror Finder tag colors from the project folders on macOS;
- use the same entries from Terminal with `p my-project`;
- keep processes running when the desktop window is closed.

The interface is deliberately quiet: a compact Fira Code, terminal-inspired dashboard without Docker or a heavyweight embedded browser.

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

The desktop app and CLI read the same project list, runtime state, and logs. `p list` also shows
the current Git branch and working-tree summary.

## Import many projects with an agent

Runbox deliberately does not crawl your disk by itself. Codex or another local coding agent can inspect a workspace, choose the real application roots, and add them safely.

Copy this prompt into your agent:

```text
Scan my local workspace for project roots. Look for Git repositories and common
launch manifests such as package.json, pnpm-lock.yaml, Cargo.toml, justfile, and
Docker Compose files.

For each project with a clear dev or start command:
1. Use the folder name as the friendly project name.
2. Skip node_modules, build output, research copies, archives, snapshots, and
   repositories without a runnable development command.
3. Run: p add "<absolute-project-path>" --name "<friendly-name>"
4. If automatic detection is wrong, pass --command "<correct-command>".
5. Do not start any project during import.
6. Finish with p list and report what was added and what was skipped.
```

The workflow an agent should follow is:

```bash
# Inspect only — identify repositories and manifests
find /path/to/workspace -type d -name .git

# Add or update a detected project
p add "/path/to/workspace/my-web" --name "my-web"

# Override detection when needed
p add "/path/to/workspace/desktop-app" \
  --name "desktop-app" \
  --command "pnpm app:dev"

# Verify without starting anything
p list
```

`p add` is idempotent by canonical project path. Re-running the scan updates an existing entry instead of creating a duplicate. Machine-specific project paths remain in the local Runbox data directory and are never committed to this repository.

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

## Git status

For folders inside a Git worktree, Runbox reads `git status --porcelain=v2 --branch` in the
background and shows the branch, clean/changed state, and ahead/behind counts. The **Git changes**
sidebar filter narrows the workspace to projects with local changes.

Click the Git status on a project to open its Git workspace. The first Git client release covers the
core GitHub Desktop workflow:

- review staged and unstaged file diffs;
- stage or unstage individual files or all files;
- commit staged changes;
- switch local branches or create a branch;
- fetch, fast-forward pull, push, or publish a branch.

Background checks remain local and read-only. Network operations only run after an explicit click.
Pull uses `--ff-only`, Runbox does not force-push, and destructive discard/reset actions are not
exposed.

### AI commit messages

Stage the files you want to commit, choose a provider in the commit box, and click **Generate**.
Runbox fills the commit textarea so you can review or edit the result before committing. It never
commits automatically.

**A local model is optional.** Runbox works with Codex, Cursor, or ordinary manual commit messages
without Ollama. If no local model is detected, the commit box shows a small setup prompt that can be
dismissed with **Not now**. Runbox never installs Ollama or downloads a model automatically.

Providers are discovered from the login shell:

- **Ollama** — every model shown by `ollama list` is available. The staged diff stays on the Mac.
- **Codex** — uses `codex exec` with an ephemeral session and a read-only sandbox. It reuses the
  existing Codex CLI login.
- **Cursor** — uses `cursor-agent` in read-only ask mode and reuses the existing Cursor login.

To opt into local generation, install [Ollama](https://ollama.com/download), then add a model:

```bash
ollama pull qwen3:4b
```

`qwen3:4b` is the lightweight default recommendation (about 2.5 GB). `qwen3:8b` produces stronger
results on capable machines but requires about 5.2 GB. Any model returned by `ollama list` appears
automatically in Runbox.

Only staged changes, their summary, the branch name, and recent commit subjects are included in the
generation context. Codex and Cursor are cloud providers, so their selected context is sent to that
provider; choose Ollama when repository content must remain local. Runbox does not store model
credentials or generated diff context.

## Project views

All views use the same project data, search, filters, sort order, pinned projects, and Git status:

- **Comfortable** — two-column cards with more room for branch and command details;
- **Compact** — the original three-column overview for large workspaces;
- **Table** — a Notion-style data grid for scanning project, activity, Git, command, and actions.

The selected view is saved locally and restored the next time Runbox opens.

### Finder tag colors on macOS

Projects imported from the CLI have not yet been selected by the desktop app. If Runbox shows
**Finder colors**, click it once and choose the parent folder that contains your projects. macOS
remembers that folder access, and Runbox then mirrors its Finder tag dots automatically.

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
