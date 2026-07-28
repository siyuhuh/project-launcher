import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  Cpu,
  ExternalLink,
  FileClock,
  GitBranch,
  GitCommitHorizontal,
  History,
  LoaderCircle,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import {
  createBranch,
  createCommit,
  fetchRepository,
  generateCommitMessage,
  getGitCommitDetail,
  getCommitMessageProviders,
  getGitDiff,
  getGitHistory,
  getGitWorkspace,
  openLocalAiSetup,
  pullRepository,
  pushRepository,
  revertGitCommit,
  stageGitFiles,
  switchBranch,
  unstageGitFiles,
} from "../lib/backend";
import type {
  CommitMessageProvider,
  GitCommit,
  GitCommitDetail,
  GitFileChange,
  GitWorkspace,
  ProjectView,
} from "../types";

type Selection = { path: string; staged: boolean };
type GitView = "changes" | "history";
const COMMIT_PROVIDER_STORAGE_KEY = "runbox.commitProvider";
const LOCAL_AI_PROMPT_STORAGE_KEY = "runbox.localAiPromptDismissed";
const HISTORY_PAGE_SIZE = 30;

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
  const [commitProviders, setCommitProviders] = useState<CommitMessageProvider[]>([]);
  const [commitProviderId, setCommitProviderId] = useState("");
  const [providersLoading, setProvidersLoading] = useState(true);
  const [localSetupExpanded, setLocalSetupExpanded] = useState(
    () => window.localStorage.getItem(LOCAL_AI_PROMPT_STORAGE_KEY) !== "true",
  );
  const [branchDraft, setBranchDraft] = useState("");
  const [view, setView] = useState<GitView>("changes");
  const [history, setHistory] = useState<GitCommit[]>([]);
  const [historyPath, setHistoryPath] = useState<string | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(null);
  const [commitDetail, setCommitDetail] = useState<GitCommitDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [revertConfirmHash, setRevertConfirmHash] = useState<string | null>(null);
  const busyRef = useRef(false);
  const historyRequestRef = useRef(0);

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

  const loadHistory = useCallback(
    async (reset: boolean, filePath: string | null, offset: number) => {
      const requestId = ++historyRequestRef.current;
      setHistoryLoading(true);
      if (reset) {
        setHistory([]);
        setHistoryHasMore(false);
        setSelectedCommitHash(null);
        setCommitDetail(null);
        setRevertConfirmHash(null);
      }
      try {
        const page = await getGitHistory(
          project.id,
          reset ? 0 : offset,
          HISTORY_PAGE_SIZE,
          filePath,
        );
        if (requestId !== historyRequestRef.current) return;
        setHistory((current) => (reset ? page.commits : [...current, ...page.commits]));
        setHistoryHasMore(page.hasMore);
        if (reset) setSelectedCommitHash(page.commits[0]?.hash ?? null);
      } catch (error) {
        if (requestId === historyRequestRef.current) {
          onNotify(errorMessage(error), "error");
        }
      } finally {
        if (requestId === historyRequestRef.current) setHistoryLoading(false);
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
    if (view === "history") void loadHistory(true, historyPath, 0);
  }, [historyPath, loadHistory, view]);

  useEffect(() => {
    if (view !== "history" || !selectedCommitHash) {
      setCommitDetail(null);
      setDetailLoading(false);
      return;
    }
    let cancelled = false;
    setCommitDetail(null);
    setRevertConfirmHash(null);
    setDetailLoading(true);
    getGitCommitDetail(project.id, selectedCommitHash)
      .then((detail) => {
        if (!cancelled) setCommitDetail(detail);
      })
      .catch((error) => {
        if (!cancelled) onNotify(errorMessage(error), "error");
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onNotify, project.id, selectedCommitHash, view]);

  useEffect(() => {
    let cancelled = false;
    getCommitMessageProviders()
      .then((providers) => {
        if (cancelled) return;
        setCommitProviders(providers);
        const saved = window.localStorage.getItem(COMMIT_PROVIDER_STORAGE_KEY);
        const preferred =
          providers.find((provider) => provider.id === saved) ??
          providers.find((provider) => provider.local) ??
          providers[0];
        setCommitProviderId(preferred?.id ?? "");
      })
      .catch((error) => {
        if (!cancelled) onNotify(errorMessage(error), "error");
      })
      .finally(() => {
        if (!cancelled) setProvidersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onNotify]);

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
  const hasLocalProvider = useMemo(
    () => commitProviders.some((provider) => provider.local),
    [commitProviders],
  );
  const selectedCommitProvider = useMemo(
    () => commitProviders.find((provider) => provider.id === commitProviderId),
    [commitProviderId, commitProviders],
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
      if (view === "history") {
        void loadHistory(true, historyPath, 0);
      } else {
        setHistory([]);
      }
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

  async function handleGenerateCommitMessage() {
    if (!commitProviderId || stagedFiles.length === 0 || busy) return;
    setBusy("generate");
    try {
      const message = await generateCommitMessage(project.id, commitProviderId);
      setCommitMessage(message);
      onNotify(`Drafted with ${selectedCommitProvider?.name ?? "AI"}`, "success");
    } catch (error) {
      onNotify(errorMessage(error), "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleOpenLocalAiSetup() {
    try {
      await openLocalAiSetup();
    } catch (error) {
      onNotify(errorMessage(error), "error");
    }
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

  async function handleRevert() {
    if (
      !commitDetail ||
      revertConfirmHash !== commitDetail.hash ||
      busy ||
      commitDetail.parents.length > 1
    ) {
      return;
    }
    setBusy("revert");
    try {
      setWorkspace(await revertGitCommit(project.id, commitDetail.hash));
      onProjectRefresh();
      onNotify(`Created a revert for ${commitDetail.shortHash}`, "success");
      await loadHistory(true, historyPath, 0);
    } catch (error) {
      onNotify(errorMessage(error), "error");
    } finally {
      setBusy(null);
      setRevertConfirmHash(null);
    }
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

          <div className="git-view-tabs" role="tablist" aria-label="Git workspace view">
            <button
              role="tab"
              aria-selected={view === "changes"}
              data-active={view === "changes"}
              onClick={() => setView("changes")}
            >
              Changes
              {workspace?.files.length ? <span>{workspace.files.length}</span> : null}
            </button>
            <button
              role="tab"
              aria-selected={view === "history"}
              data-active={view === "history"}
              onClick={() => setView("history")}
            >
              <History size={12} /> History
            </button>
          </div>

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
          {view === "changes" ? (
            <>
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
                  <div
                    className="git-ai-row"
                    title={
                      selectedCommitProvider?.local
                        ? "Only the staged diff is read. It stays on this Mac."
                        : selectedCommitProvider
                          ? "Only the staged diff is sent to the selected provider."
                          : "AI is optional. You can still write and commit a message manually."
                    }
                  >
                    <label className="git-provider-select">
                      <Sparkles size={12} />
                      <select
                        value={commitProviderId}
                        onChange={(event) => {
                          const providerId = event.target.value;
                          setCommitProviderId(providerId);
                          window.localStorage.setItem(COMMIT_PROVIDER_STORAGE_KEY, providerId);
                        }}
                        disabled={providersLoading || commitProviders.length === 0 || Boolean(busy)}
                        aria-label="Commit message provider"
                      >
                        {commitProviders.length === 0 ? (
                          <option value="">
                            {providersLoading ? "Detecting AI…" : "No AI provider"}
                          </option>
                        ) : null}
                        {commitProviders.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.name} · {provider.local ? "local" : "cloud"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="git-generate-button"
                      onClick={() => void handleGenerateCommitMessage()}
                      disabled={
                        !commitProviderId ||
                        stagedFiles.length === 0 ||
                        Boolean(busy)
                      }
                    >
                      {busy === "generate" ? (
                        <LoaderCircle className="spin" size={12} />
                      ) : (
                        <Sparkles size={12} />
                      )}
                      Generate
                    </button>
                  </div>
                  {!providersLoading && !hasLocalProvider ? (
                    localSetupExpanded ? (
                      <div className="git-local-ai-prompt">
                        <Cpu size={14} />
                        <div className="git-local-ai-copy">
                          <strong>Run locally? Optional.</strong>
                          <span>
                            {commitProviders.length > 0
                              ? "Keep using a cloud provider, or set up Ollama."
                              : "Manual commits still work, or set up Ollama."}
                          </span>
                          <code>ollama pull qwen3:4b</code>
                        </div>
                        <div className="git-local-ai-actions">
                          <button
                            onClick={() => {
                              setLocalSetupExpanded(false);
                              window.localStorage.setItem(
                                LOCAL_AI_PROMPT_STORAGE_KEY,
                                "true",
                              );
                            }}
                          >
                            Not now
                          </button>
                          <button onClick={() => void handleOpenLocalAiSetup()}>
                            Setup guide <ExternalLink size={10} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="git-local-ai-link"
                        onClick={() => setLocalSetupExpanded(true)}
                      >
                        <Cpu size={10} /> Local AI is optional
                      </button>
                    )
                  ) : null}
                  <textarea
                    value={commitMessage}
                    onChange={(event) => setCommitMessage(event.target.value)}
                    placeholder="Commit message"
                    aria-label="Commit message"
                    rows={3}
                    disabled={Boolean(busy)}
                  />
                  <button
                    className="git-commit-button"
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
                  {selection ? (
                    <div className="git-diff-header-actions">
                      <button
                        className="git-file-history-button"
                        onClick={() => {
                          setHistoryPath(selection.path);
                          setView("history");
                        }}
                        title={`Show history for ${selection.path}`}
                      >
                        <FileClock size={12} /> File history
                      </button>
                      <FileStatus status={workspace?.files.find((file) => file.path === selection.path)?.status ?? ""} />
                    </div>
                  ) : null}
                </div>
                <DiffView contents={diff} loading={diffLoading} hasSelection={Boolean(selection)} />
              </main>
            </>
          ) : (
            <>
              <GitHistoryTimeline
                commits={history}
                selectedHash={selectedCommitHash}
                filePath={historyPath}
                loading={historyLoading}
                hasMore={historyHasMore}
                onSelect={setSelectedCommitHash}
                onShowAll={() => setHistoryPath(null)}
                onLoadMore={() =>
                  void loadHistory(false, historyPath, history.length)
                }
              />
              <GitCommitDetailView
                detail={commitDetail}
                loading={detailLoading}
                workingTreeDirty={Boolean(workspace?.files.length)}
                busy={busy === "revert"}
                confirming={revertConfirmHash === commitDetail?.hash}
                onRequestRevert={() =>
                  setRevertConfirmHash(commitDetail?.hash ?? null)
                }
                onCancelRevert={() => setRevertConfirmHash(null)}
                onConfirmRevert={() => void handleRevert()}
              />
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function GitHistoryTimeline({
  commits,
  selectedHash,
  filePath,
  loading,
  hasMore,
  onSelect,
  onShowAll,
  onLoadMore,
}: {
  commits: GitCommit[];
  selectedHash: string | null;
  filePath: string | null;
  loading: boolean;
  hasMore: boolean;
  onSelect: (hash: string) => void;
  onShowAll: () => void;
  onLoadMore: () => void;
}) {
  return (
    <aside className="git-history-pane">
      <header className="git-history-scope">
        <div>
          <span><History size={11} /> {filePath ? "FILE HISTORY" : "RECENT COMMITS"}</span>
          {filePath ? <strong title={filePath}>{filePath}</strong> : null}
        </div>
        {filePath ? <button onClick={onShowAll}>All commits</button> : null}
      </header>

      {loading && commits.length === 0 ? (
        <div className="git-loading-state">
          <LoaderCircle className="spin" size={15} /> Reading history
        </div>
      ) : commits.length === 0 ? (
        <div className="git-history-empty">
          <GitCommitHorizontal size={18} />
          <strong>No commits found</strong>
          <span>{filePath ? "This file has no committed history yet." : "This repository has no commits yet."}</span>
        </div>
      ) : (
        <div className="git-history-list">
          {commits.map((commit) => (
            <button
              className="git-history-row"
              data-active={selectedHash === commit.hash}
              key={commit.hash}
              onClick={() => onSelect(commit.hash)}
              title={commit.subject}
            >
              <span className="git-history-rail" aria-hidden="true"><i /></span>
              <span className="git-history-copy">
                <strong>{commit.subject}</strong>
                <span>{commit.authorName} · {formatCommitDate(commit.authoredAt, true)}</span>
                {commit.refs.length ? (
                  <span className="git-history-refs">
                    {commit.refs.slice(0, 2).map((ref) => <em key={ref}>{ref}</em>)}
                  </span>
                ) : null}
              </span>
              <code>{commit.shortHash}</code>
            </button>
          ))}
          {hasMore ? (
            <button
              className="git-history-more"
              onClick={onLoadMore}
              disabled={loading}
            >
              {loading ? <LoaderCircle className="spin" size={11} /> : null}
              Load older commits
            </button>
          ) : (
            <div className="git-history-end">End of history</div>
          )}
        </div>
      )}
    </aside>
  );
}

function GitCommitDetailView({
  detail,
  loading,
  workingTreeDirty,
  busy,
  confirming,
  onRequestRevert,
  onCancelRevert,
  onConfirmRevert,
}: {
  detail: GitCommitDetail | null;
  loading: boolean;
  workingTreeDirty: boolean;
  busy: boolean;
  confirming: boolean;
  onRequestRevert: () => void;
  onCancelRevert: () => void;
  onConfirmRevert: () => void;
}) {
  if (loading) {
    return (
      <main className="git-history-detail">
        <div className="git-diff-empty">
          <LoaderCircle className="spin" size={16} /> Reading commit
        </div>
      </main>
    );
  }
  if (!detail) {
    return (
      <main className="git-history-detail">
        <div className="git-diff-empty">
          <GitCommitHorizontal size={19} /> Select a commit to inspect it.
        </div>
      </main>
    );
  }

  const mergeCommit = detail.parents.length > 1;
  const revertDisabled = mergeCommit || workingTreeDirty || busy;
  const revertTitle = mergeCommit
    ? "Merge commits are view-only because reverting one requires choosing a mainline parent"
    : workingTreeDirty
      ? "Commit or stash local changes before reverting"
      : "Create a new commit that reverses this commit";

  return (
    <main className="git-history-detail">
      <header className="git-commit-detail-header">
        <div className="git-commit-title-row">
          <div>
            {detail.refs.length ? (
              <div className="git-commit-refs">
                {detail.refs.map((ref) => <span key={ref}>{ref}</span>)}
              </div>
            ) : null}
            <h3>{detail.subject}</h3>
          </div>
          <button
            className="git-revert-button"
            onClick={onRequestRevert}
            disabled={revertDisabled}
            title={revertTitle}
          >
            <RotateCcw size={12} /> Revert commit
          </button>
        </div>
        {detail.body ? <p>{detail.body}</p> : null}
        <div className="git-commit-meta">
          <span><strong>{detail.authorName}</strong> &lt;{detail.authorEmail}&gt;</span>
          <span>{formatCommitDate(detail.authoredAt, false)}</span>
          <code title={detail.hash}>{detail.shortHash}</code>
          {mergeCommit ? <em>Merge · view only</em> : null}
        </div>
        {confirming ? (
          <div className="git-revert-confirm">
            <AlertTriangle size={14} />
            <div>
              <strong>Reverse {detail.shortHash} with a new commit?</strong>
              <span>History stays intact. If Git finds a conflict, Runbox aborts the revert.</span>
            </div>
            <button onClick={onCancelRevert} disabled={busy}>Cancel</button>
            <button onClick={onConfirmRevert} disabled={busy}>
              {busy ? <LoaderCircle className="spin" size={11} /> : <RotateCcw size={11} />}
              Create revert
            </button>
          </div>
        ) : null}
      </header>

      <section className="git-commit-files">
        <header>
          <span>FILES <strong>{detail.files.length}</strong></span>
          {detail.patchTruncated ? <em>Patch truncated</em> : null}
        </header>
        <div>
          {detail.files.map((file) => (
            <span className="git-commit-file" key={`${file.status}:${file.previousPath ?? ""}:${file.path}`} title={file.path}>
              <FileStatus status={file.status} />
              <span>
                {file.previousPath ? <small>{file.previousPath} →</small> : null}
                {file.path}
              </span>
            </span>
          ))}
        </div>
      </section>

      <div className="git-commit-patch-header">
        <span>PATCH</span>
        <code>{detail.shortHash}</code>
      </div>
      <DiffView contents={detail.patch} loading={false} hasSelection />
    </main>
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

function formatCommitDate(value: string, compact: boolean): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    year: compact ? undefined : "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
