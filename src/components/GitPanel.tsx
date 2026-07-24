import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  GitBranch,
  GitCommitHorizontal,
  LoaderCircle,
  Minus,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import {
  createBranch,
  createCommit,
  fetchRepository,
  getGitDiff,
  getGitWorkspace,
  pullRepository,
  pushRepository,
  stageGitFiles,
  switchBranch,
  unstageGitFiles,
} from "../lib/backend";
import type { GitFileChange, GitWorkspace, ProjectView } from "../types";

type Selection = { path: string; staged: boolean };

interface Props {
  project: ProjectView;
  onClose: () => void;
  onProjectRefresh: () => void;
  onNotify: (message: string, tone: "success" | "error") => void;
}

export function GitPanel({
  project,
  onClose,
  onProjectRefresh,
  onNotify,
}: Props) {
  const [workspace, setWorkspace] = useState<GitWorkspace | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [diff, setDiff] = useState("");
  const [loading, setLoading] = useState(true);
  const [diffLoading, setDiffLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [branchDraft, setBranchDraft] = useState("");
  const busyRef = useRef(false);

  const refresh = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoading(true);
      try {
        setWorkspace(await getGitWorkspace(project.id));
      } catch (error) {
        onNotify(errorMessage(error), "error");
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [onNotify, project.id],
  );

  useEffect(() => {
    void refresh(true);
    const interval = window.setInterval(() => {
      if (!busyRef.current) void refresh();
    }, 2_500);
    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    busyRef.current = Boolean(busy);
  }, [busy]);

  useEffect(() => {
    if (!workspace) return;
    const selectionStillExists = selection
      ? workspace.files.some(
          (file) =>
            file.path === selection.path &&
            (selection.staged ? file.staged : file.unstaged),
        )
      : false;
    if (selectionStillExists) return;

    const firstUnstaged = workspace.files.find((file) => file.unstaged);
    const firstStaged = workspace.files.find((file) => file.staged);
    setSelection(
      firstUnstaged
        ? { path: firstUnstaged.path, staged: false }
        : firstStaged
          ? { path: firstStaged.path, staged: true }
          : null,
    );
  }, [selection, workspace]);

  useEffect(() => {
    if (!selection) {
      setDiff("");
      return;
    }
    let cancelled = false;
    setDiffLoading(true);
    getGitDiff(project.id, selection.path, selection.staged)
      .then((contents) => {
        if (!cancelled) setDiff(contents);
      })
      .catch((error) => {
        if (!cancelled) {
          setDiff("");
          onNotify(errorMessage(error), "error");
        }
      })
      .finally(() => {
        if (!cancelled) setDiffLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onNotify, project.id, selection]);

  const stagedFiles = useMemo(
    () => workspace?.files.filter((file) => file.staged) ?? [],
    [workspace],
  );
  const unstagedFiles = useMemo(
    () => workspace?.files.filter((file) => file.unstaged) ?? [],
    [workspace],
  );

  async function runOperation(
    label: string,
    action: () => Promise<GitWorkspace>,
    successMessage: string,
  ) {
    if (busy) return;
    setBusy(label);
    try {
      setWorkspace(await action());
      onProjectRefresh();
      onNotify(successMessage, "success");
    } catch (error) {
      onNotify(errorMessage(error), "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleCommit() {
    const message = commitMessage.trim();
    if (!message || stagedFiles.length === 0) return;
    await runOperation(
      "commit",
      () => createCommit(project.id, message),
      `Committed to ${workspace?.branch ?? "branch"}`,
    );
    setCommitMessage("");
  }

  async function handleCreateBranch() {
    const branch = branchDraft.trim();
    if (!branch) return;
    await runOperation(
      "branch",
      () => createBranch(project.id, branch),
      `Created ${branch}`,
    );
    setBranchDraft("");
  }

  const hasRemote = Boolean(workspace?.remoteUrl || workspace?.upstream);
  const canPull = Boolean(workspace?.upstream && workspace.behind > 0);
  const canPush = Boolean(
    workspace &&
      ((workspace.upstream && workspace.ahead > 0) ||
        (!workspace.upstream && workspace.remoteUrl)),
  );

  return (
    <div
      className="git-panel-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section className="git-workspace" role="dialog" aria-modal="true" aria-label={`Git workspace for ${project.name}`}>
        <header className="git-workspace-header">
          <div>
            <div className="git-workspace-kicker">
              <GitBranch size={12} /> GIT WORKSPACE
            </div>
            <h2>{project.name}</h2>
            <p title={project.path}>{project.path}</p>
          </div>
          <button className="panel-close-button" onClick={onClose} aria-label="Close Git workspace">
            <X size={16} />
          </button>
        </header>

        <div className="git-toolbar">
          <label className="git-branch-select">
            <GitBranch size={14} />
            <select
              value={workspace?.branch ?? ""}
              onChange={(event) => {
                const branch = event.target.value;
                if (branch && branch !== workspace?.branch) {
                  void runOperation(
                    "branch",
                    () => switchBranch(project.id, branch),
                    `Switched to ${branch}`,
                  );
                }
              }}
              disabled={!workspace || Boolean(busy)}
            >
              {workspace?.branches.map((branch) => (
                <option key={branch} value={branch}>{branch}</option>
              ))}
            </select>
          </label>

          <form
            className="git-new-branch"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreateBranch();
            }}
          >
            <input
              value={branchDraft}
              onChange={(event) => setBranchDraft(event.target.value)}
              placeholder="New branch"
              aria-label="New branch name"
              disabled={Boolean(busy)}
            />
            <button type="submit" disabled={!branchDraft.trim() || Boolean(busy)} title="Create branch">
              <Plus size={13} />
            </button>
          </form>

          <div className="git-sync-actions">
            <button
              onClick={() =>
                void runOperation(
                  "fetch",
                  () => fetchRepository(project.id),
                  "Fetched remote changes",
                )
              }
              disabled={!hasRemote || Boolean(busy)}
              title={hasRemote ? "Fetch remote changes" : "No remote configured"}
            >
              <RefreshCw className={busy === "fetch" ? "spin" : ""} size={13} /> Fetch
            </button>
            <button
              onClick={() =>
                void runOperation(
                  "pull",
                  () => pullRepository(project.id),
                  "Pulled remote changes",
                )
              }
              disabled={!canPull || Boolean(busy)}
              title={workspace?.upstream ? "Fast-forward pull" : "No upstream branch"}
            >
              <ArrowDownToLine size={13} /> Pull
              {workspace?.behind ? <span>{workspace.behind}</span> : null}
            </button>
            <button
              className="git-push-button"
              onClick={() =>
                void runOperation(
                  "push",
                  () => pushRepository(project.id),
                  workspace?.upstream ? "Pushed commits" : "Published branch",
                )
              }
              disabled={!canPush || Boolean(busy)}
              title={workspace?.upstream ? "Push local commits" : "Publish branch to origin"}
            >
              <ArrowUpFromLine size={13} />
              {workspace?.upstream ? "Push" : "Publish"}
              {workspace?.ahead ? <span>{workspace.ahead}</span> : null}
            </button>
          </div>
        </div>

        <div className="git-workspace-body">
          <aside className="git-change-pane">
            {loading ? (
              <div className="git-loading-state">
                <LoaderCircle className="spin" size={15} /> Reading repository
              </div>
            ) : workspace ? (
              <>
                <GitFileSection
                  title="Staged changes"
                  files={stagedFiles}
                  selection={selection}
                  staged
                  actionLabel="Unstage all"
                  actionDisabled={Boolean(busy)}
                  onAction={() =>
                    void runOperation(
                      "unstage",
                      () => unstageGitFiles(project.id, stagedFiles.map((file) => file.path)),
                      "Unstaged changes",
                    )
                  }
                  onSelect={(path) => setSelection({ path, staged: true })}
                  onToggle={(path) =>
                    void runOperation(
                      "unstage",
                      () => unstageGitFiles(project.id, [path]),
                      "Unstaged file",
                    )
                  }
                />
                <GitFileSection
                  title="Changes"
                  files={unstagedFiles}
                  selection={selection}
                  staged={false}
                  actionLabel="Stage all"
                  actionDisabled={Boolean(busy)}
                  onAction={() =>
                    void runOperation(
                      "stage",
                      () => stageGitFiles(project.id, unstagedFiles.map((file) => file.path)),
                      "Staged changes",
                    )
                  }
                  onSelect={(path) => setSelection({ path, staged: false })}
                  onToggle={(path) =>
                    void runOperation(
                      "stage",
                      () => stageGitFiles(project.id, [path]),
                      "Staged file",
                    )
                  }
                />
                {workspace.files.length === 0 ? (
                  <div className="git-clean-state">
                    <Check size={17} />
                    <strong>Working tree clean</strong>
                    <span>No local changes on {workspace.branch}.</span>
                  </div>
                ) : null}
                <div className="git-commit-box">
                  <textarea
                    value={commitMessage}
                    onChange={(event) => setCommitMessage(event.target.value)}
                    placeholder="Commit message"
                    aria-label="Commit message"
                    rows={3}
                    disabled={Boolean(busy)}
                  />
                  <button
                    onClick={() => void handleCommit()}
                    disabled={!commitMessage.trim() || stagedFiles.length === 0 || Boolean(busy)}
                  >
                    {busy === "commit" ? (
                      <LoaderCircle className="spin" size={13} />
                    ) : (
                      <GitCommitHorizontal size={14} />
                    )}
                    Commit {stagedFiles.length || ""}
                  </button>
                </div>
              </>
            ) : null}
          </aside>

          <main className="git-diff-pane">
            <div className="git-diff-header">
              <div>
                <strong title={selection?.path}>{selection?.path ?? "Select a changed file"}</strong>
                {selection ? (
                  <span>{selection.staged ? "Staged diff" : "Working tree diff"}</span>
                ) : null}
              </div>
              {selection ? <FileStatus status={workspace?.files.find((file) => file.path === selection.path)?.status ?? ""} /> : null}
            </div>
            <DiffView contents={diff} loading={diffLoading} hasSelection={Boolean(selection)} />
          </main>
        </div>
      </section>
    </div>
  );
}

function GitFileSection({
  title,
  files,
  selection,
  staged,
  actionLabel,
  actionDisabled,
  onAction,
  onSelect,
  onToggle,
}: {
  title: string;
  files: GitFileChange[];
  selection: Selection | null;
  staged: boolean;
  actionLabel: string;
  actionDisabled: boolean;
  onAction: () => void;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
}) {
  if (files.length === 0) return null;
  return (
    <section className="git-file-section">
      <header>
        <span>{title} <strong>{files.length}</strong></span>
        <button onClick={onAction} disabled={actionDisabled}>{actionLabel}</button>
      </header>
      <div className="git-file-list">
        {files.map((file) => {
          const active = selection?.path === file.path && selection.staged === staged;
          return (
            <div className="git-file-row" data-active={active} key={`${staged ? "s" : "u"}:${file.path}`}>
              <button className="git-file-main" onClick={() => onSelect(file.path)} title={file.path}>
                <FileStatus status={file.status} />
                <span>{file.path}</span>
              </button>
              <button
                className="git-stage-toggle"
                onClick={() => onToggle(file.path)}
                disabled={actionDisabled}
                aria-label={`${staged ? "Unstage" : "Stage"} ${file.path}`}
                title={staged ? "Unstage file" : "Stage file"}
              >
                {staged ? <Minus size={12} /> : <Plus size={12} />}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FileStatus({ status }: { status: string }) {
  const normalized = status.includes("U")
    ? "U"
    : status.includes("A") || status === "??"
      ? "A"
      : status.includes("D")
        ? "D"
        : status.includes("R")
          ? "R"
          : "M";
  return <span className="git-file-status" data-status={normalized}>{normalized}</span>;
}

function DiffView({
  contents,
  loading,
  hasSelection,
}: {
  contents: string;
  loading: boolean;
  hasSelection: boolean;
}) {
  const lines = useMemo(() => contents.split("\n"), [contents]);
  if (loading) {
    return <div className="git-diff-empty"><LoaderCircle className="spin" size={16} /> Reading diff</div>;
  }
  if (!hasSelection) {
    return <div className="git-diff-empty"><GitCommitHorizontal size={19} /> Select a file to review its changes.</div>;
  }
  if (!contents.trim()) {
    return <div className="git-diff-empty">No textual diff for this file.</div>;
  }
  return (
    <pre className="git-diff">
      <code>
        {lines.map((line, index) => (
          <span key={`${index}:${line.slice(0, 24)}`} data-kind={diffLineKind(line)}>
            {line || " "}
          </span>
        ))}
      </code>
    </pre>
  );
}

function diffLineKind(line: string): "add" | "remove" | "hunk" | "meta" | "context" {
  if (line.startsWith("+++") || line.startsWith("---")) return "meta";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "remove";
  if (line.startsWith("@@")) return "hunk";
  if (
    line.startsWith("diff ") ||
    line.startsWith("index ") ||
    line.startsWith("new file") ||
    line.startsWith("deleted file")
  ) {
    return "meta";
  }
  return "context";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
