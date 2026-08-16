import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
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
  Trash2,
  X,
} from "lucide-react";
import {
  applyStash,
  cherryPickCommit,
  createBranch,
  createBranchFromCommit,
  createCommit,
  createStash,
  deleteBranch,
  discardAllGitChanges,
  discardGitFiles,
  dropStash,
  fetchRepository,
  generateCommitMessage,
  getGitCommitDetail,
  getCommitMessageProviders,
  getGitDiff,
  getGitHistory,
  getGitWorkspace,
  mergeBranch,
  openLocalAiSetup,
  pullRepository,
  pushRepository,
  rebaseBranch,
  renameBranch,
  revertGitCommit,
  stageGitFiles,
  switchBranch,
  unstageGitFiles,
} from "../lib/backend";
import { useI18n } from "../lib/i18n";
import type {
  CommitMessageProvider,
  GitCommit,
  GitCommitDetail,
  GitFileChange,
  GitStash,
  GitWorkspace,
  ProjectView,
} from "../types";

type Selection = { path: string; staged: boolean };
type GitView = "changes" | "history" | "branches" | "stashes";
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
  const { t } = useI18n();
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
  const [stashMessage, setStashMessage] = useState("");
  const [stashIncludeUntracked, setStashIncludeUntracked] = useState(true);
  const [dropConfirmReference, setDropConfirmReference] = useState<string | null>(null);
  const [view, setView] = useState<GitView>("changes");
  const [history, setHistory] = useState<GitCommit[]>([]);
  const [historyPath, setHistoryPath] = useState<string | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyAllBranches, setHistoryAllBranches] = useState(false);
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(null);
  const [commitDetail, setCommitDetail] = useState<GitCommitDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [revertConfirmHash, setRevertConfirmHash] = useState<string | null>(null);
  const [cherryPickConfirmHash, setCherryPickConfirmHash] = useState<string | null>(null);
  const [branchFromCommitHash, setBranchFromCommitHash] = useState<string | null>(null);
  const [branchFromCommitDraft, setBranchFromCommitDraft] = useState("");
  const [discardConfirmPath, setDiscardConfirmPath] = useState<string | null>(null);
  const [discardAllConfirm, setDiscardAllConfirm] = useState(false);
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
        setCherryPickConfirmHash(null);
        setBranchFromCommitHash(null);
      }
      try {
        const page = await getGitHistory(
          project.id,
          reset ? 0 : offset,
          HISTORY_PAGE_SIZE,
          filePath,
          historyAllBranches,
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
    [historyAllBranches, onNotify, project.id],
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
    setCherryPickConfirmHash(null);
    setBranchFromCommitHash(null);
    setBranchFromCommitDraft("");
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
    if (
      dropConfirmReference &&
      workspace &&
      !workspace.stashes.some((stash) => stash.reference === dropConfirmReference)
    ) {
      setDropConfirmReference(null);
    }
  }, [dropConfirmReference, workspace]);

  useEffect(() => {
    if (
      discardConfirmPath &&
      workspace &&
      !workspace.files.some((file) => file.path === discardConfirmPath)
    ) {
      setDiscardConfirmPath(null);
    }
    if (workspace?.files.length === 0) setDiscardAllConfirm(false);
  }, [discardConfirmPath, workspace]);

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
      void refresh();
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
      t("Committed to {{branch}}", { branch: workspace?.branch ?? t("branch") }),
    );
    setCommitMessage("");
  }

  async function handleGenerateCommitMessage() {
    if (!commitProviderId || stagedFiles.length === 0 || busy) return;
    setBusy("generate");
    try {
      const message = await generateCommitMessage(project.id, commitProviderId);
      setCommitMessage(message);
      onNotify(t("Drafted with {{provider}}", { provider: selectedCommitProvider?.name ?? "AI" }), "success");
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
      t("Created {{branch}}", { branch }),
    );
    setBranchDraft("");
  }

  async function handleCheckoutBranch(branch: string) {
    await runOperation(
      "checkout",
      () => switchBranch(project.id, branch),
      t("Checked out {{branch}}", { branch }),
    );
  }

  async function handleRenameBranch(branch: string, nextBranch: string) {
    await runOperation(
      "branch-rename",
      () => renameBranch(project.id, branch, nextBranch),
      t("Renamed {{branch}} to {{next}}", { branch, next: nextBranch }),
    );
  }

  async function handleDeleteBranch(branch: string, force: boolean) {
    await runOperation(
      "branch-delete",
      () => deleteBranch(project.id, branch, force),
      t("Deleted branch {{branch}}", { branch }),
    );
  }

  async function handleMergeBranch(branch: string) {
    await runOperation(
      "branch-merge",
      () => mergeBranch(project.id, branch),
      t("Merged {{branch}} into {{current}}", {
        branch,
        current: workspace?.branch ?? t("current branch"),
      }),
    );
  }

  async function handleRebaseBranch(branch: string) {
    await runOperation(
      "branch-rebase",
      () => rebaseBranch(project.id, branch),
      t("Rebased {{current}} onto {{branch}}", {
        branch,
        current: workspace?.branch ?? t("current branch"),
      }),
    );
  }

  async function handleDiscardPath(path: string) {
    if (busy) return;
    if (discardConfirmPath !== path) {
      setDiscardConfirmPath(path);
      setDiscardAllConfirm(false);
      return;
    }
    await runOperation(
      "discard-file",
      () => discardGitFiles(project.id, [path]),
      t("Discarded changes in {{path}}", { path }),
    );
    setDiscardConfirmPath(null);
  }

  async function handleDiscardAll() {
    if (busy || !workspace?.files.length) return;
    if (!discardAllConfirm) {
      setDiscardAllConfirm(true);
      setDiscardConfirmPath(null);
      return;
    }
    await runOperation(
      "discard-all",
      () => discardAllGitChanges(project.id),
      t("Discarded all local changes"),
    );
    setDiscardAllConfirm(false);
  }

  async function handleCherryPick() {
    if (!commitDetail || cherryPickConfirmHash !== commitDetail.hash || busy) return;
    await runOperation(
      "cherry-pick",
      () => cherryPickCommit(project.id, commitDetail.hash),
      t("Cherry-picked {{hash}}", { hash: commitDetail.shortHash }),
    );
    setCherryPickConfirmHash(null);
  }

  async function handleCreateBranchFromCommit() {
    if (!commitDetail || branchFromCommitHash !== commitDetail.hash || !branchFromCommitDraft.trim()) {
      return;
    }
    const branch = branchFromCommitDraft.trim();
    await runOperation(
      "branch-from-commit",
      () => createBranchFromCommit(project.id, branch, commitDetail.hash),
      t("Created {{branch}} from {{hash}}", { branch, hash: commitDetail.shortHash }),
    );
    setBranchFromCommitDraft("");
    setBranchFromCommitHash(null);
  }

  async function handleCreateStash() {
    if (!workspace?.files.length || busy) return;
    await runOperation(
      "stash-create",
      () => createStash(project.id, stashMessage.trim(), stashIncludeUntracked),
      t("Stashed local changes"),
    );
    setStashMessage("");
  }

  async function handleApplyStash(stash: GitStash, pop: boolean) {
    if (busy || workspace?.files.length) return;
    await runOperation(
      pop ? "stash-pop" : "stash-apply",
      () => applyStash(project.id, stash.reference, pop),
      pop ? t("Popped {{stash}}", { stash: stash.reference }) : t("Applied {{stash}}", { stash: stash.reference }),
    );
  }

  async function handleDropStash(stash: GitStash) {
    if (busy) return;
    if (dropConfirmReference !== stash.reference) {
      setDropConfirmReference(stash.reference);
      return;
    }
    await runOperation(
      "stash-drop",
      () => dropStash(project.id, stash.reference),
      t("Dropped {{stash}}", { stash: stash.reference }),
    );
    setDropConfirmReference(null);
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
      onNotify(t("Created a revert for {{hash}}", { hash: commitDetail.shortHash }), "success");
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
      <section className="git-workspace" role="dialog" aria-modal="true" aria-label={t("Git workspace for {{name}}", { name: project.name })}>
        <header className="git-workspace-header">
          <div>
            <div className="git-workspace-kicker">
              <GitBranch size={12} /> {t("GIT WORKSPACE")}
            </div>
            <h2>{project.name}</h2>
            <p title={project.path}>{project.path}</p>
          </div>
          <button className="panel-close-button" onClick={onClose} aria-label={t("Close Git workspace")}>
            <X size={16} />
          </button>
        </header>

        <div className="git-toolbar">
          <label className="git-branch-select">
            <GitBranch size={14} />
            <span>{t("Checkout")}</span>
            <select
              value={workspace?.branch ?? ""}
              onChange={(event) => {
                const branch = event.target.value;
                if (branch && branch !== workspace?.branch) {
                  void handleCheckoutBranch(branch);
                }
              }}
              disabled={!workspace || Boolean(busy)}
            >
              <optgroup label={t("Local branches")}>
                {workspace?.branches.map((branch) => (
                  <option key={branch} value={branch}>{branch}</option>
                ))}
              </optgroup>
              {workspace?.remoteBranches.length ? (
                <optgroup label={t("Remote branches")}>
                  {workspace.remoteBranches.map((branch) => (
                    <option key={branch} value={branch}>{branch}</option>
                  ))}
                </optgroup>
              ) : null}
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
              placeholder={t("New branch")}
              aria-label={t("New branch name")}
              disabled={Boolean(busy)}
            />
            <button type="submit" disabled={!branchDraft.trim() || Boolean(busy)} title={t("Create branch")}>
              <Plus size={13} />
            </button>
          </form>

          <div className="git-view-tabs" role="tablist" aria-label={t("Git workspace view")}>
            <button
              role="tab"
              aria-selected={view === "changes"}
              data-active={view === "changes"}
              onClick={() => setView("changes")}
            >
              {t("Changes")}
              {workspace?.files.length ? <span>{workspace.files.length}</span> : null}
            </button>
            <button
              role="tab"
              aria-selected={view === "history"}
              data-active={view === "history"}
              onClick={() => setView("history")}
            >
              <History size={12} /> {t("History")}
            </button>
            <button
              role="tab"
              aria-selected={view === "branches"}
              data-active={view === "branches"}
              onClick={() => setView("branches")}
            >
              <GitBranch size={12} /> {t("Branches")}
              {workspace?.branches.length ? <span>{workspace.branches.length}</span> : null}
            </button>
            <button
              role="tab"
              aria-selected={view === "stashes"}
              data-active={view === "stashes"}
              onClick={() => setView("stashes")}
            >
              <Archive size={12} /> {t("Stashes")}
              {workspace?.stashes.length ? <span>{workspace.stashes.length}</span> : null}
            </button>
          </div>

          <div className="git-sync-actions">
            <button
              onClick={() =>
                void runOperation(
                  "fetch",
                  () => fetchRepository(project.id),
                  t("Fetched remote changes"),
                )
              }
              disabled={!hasRemote || Boolean(busy)}
              title={hasRemote ? t("Fetch remote changes") : t("No remote configured")}
            >
              <RefreshCw className={busy === "fetch" ? "spin" : ""} size={13} /> {t("Fetch")}
            </button>
            <button
              onClick={() =>
                void runOperation(
                  "pull",
                  () => pullRepository(project.id),
                  t("Pulled remote changes"),
                )
              }
              disabled={!canPull || Boolean(busy)}
              title={workspace?.upstream ? t("Fast-forward pull") : t("No upstream branch")}
            >
              <ArrowDownToLine size={13} /> {t("Pull")}
              {workspace?.behind ? <span>{workspace.behind}</span> : null}
            </button>
            <button
              className="git-push-button"
              onClick={() =>
                void runOperation(
                  "push",
                  () => pushRepository(project.id),
                  workspace?.upstream ? t("Pushed commits") : t("Published branch"),
                )
              }
              disabled={!canPush || Boolean(busy)}
              title={workspace?.upstream ? t("Push local commits") : t("Publish branch to origin")}
            >
              <ArrowUpFromLine size={13} />
              {workspace?.upstream ? t("Push") : t("Publish")}
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
                <LoaderCircle className="spin" size={15} /> {t("Reading repository")}
              </div>
            ) : workspace ? (
              <>
                {workspace.files.length > 0 ? (
                  <div className="git-discard-all">
                    {discardAllConfirm ? (
                      <>
                        <div>
                          <AlertTriangle size={12} />
                          <span>
                            {t("Discard every local change?")}
                            <small>{t("Tracked files return to HEAD; new files move to Trash.")}</small>
                          </span>
                        </div>
                        <button
                          onClick={() => setDiscardAllConfirm(false)}
                          disabled={Boolean(busy)}
                        >
                          {t("Cancel")}
                        </button>
                        <button
                          data-danger="true"
                          onClick={() => void handleDiscardAll()}
                          disabled={Boolean(busy)}
                        >
                          {busy === "discard-all" ? (
                            <LoaderCircle className="spin" size={10} />
                          ) : (
                            <Trash2 size={10} />
                          )}
                          {t("Discard all")}
                        </button>
                      </>
                    ) : (
                      <>
                        <span>{t("Uncommitted changes")}</span>
                        <button onClick={() => void handleDiscardAll()} disabled={Boolean(busy)}>
                          <Trash2 size={10} /> {t("Discard all...")}
                        </button>
                      </>
                    )}
                  </div>
                ) : null}
                <GitFileSection
                  title={t("Staged changes")}
                  files={stagedFiles}
                  selection={selection}
                  staged
                  actionLabel={t("Unstage all")}
                  actionDisabled={Boolean(busy)}
                  onAction={() =>
                    void runOperation(
                      "unstage",
                      () => unstageGitFiles(project.id, stagedFiles.map((file) => file.path)),
                      t("Unstaged changes"),
                    )
                  }
                  onSelect={(path) => setSelection({ path, staged: true })}
                  onToggle={(path) =>
                    void runOperation(
                      "unstage",
                      () => unstageGitFiles(project.id, [path]),
                      t("Unstaged file"),
                    )
                  }
                  confirmingDiscardPath={discardConfirmPath}
                  onDiscard={(path) => void handleDiscardPath(path)}
                />
                <GitFileSection
                  title={t("Changes")}
                  files={unstagedFiles}
                  selection={selection}
                  staged={false}
                  actionLabel={t("Stage all")}
                  actionDisabled={Boolean(busy)}
                  onAction={() =>
                    void runOperation(
                      "stage",
                      () => stageGitFiles(project.id, unstagedFiles.map((file) => file.path)),
                      t("Staged changes"),
                    )
                  }
                  onSelect={(path) => setSelection({ path, staged: false })}
                  onToggle={(path) =>
                    void runOperation(
                      "stage",
                      () => stageGitFiles(project.id, [path]),
                      t("Staged file"),
                    )
                  }
                  confirmingDiscardPath={discardConfirmPath}
                  onDiscard={(path) => void handleDiscardPath(path)}
                />
                {workspace.files.length === 0 ? (
                  <div className="git-clean-state">
                    <Check size={17} />
                    <strong>{t("Working tree clean")}</strong>
                    <span>{t("No local changes on {{branch}}.", { branch: workspace.branch })}</span>
                  </div>
                ) : null}
                <div className="git-commit-box">
                  <div
                    className="git-ai-row"
                    title={
                      selectedCommitProvider?.local
                        ? t("Only the staged diff is read. It stays on this Mac.")
                        : selectedCommitProvider
                          ? t("Only the staged diff is sent to the selected provider.")
                          : t("AI is optional. You can still write and commit a message manually.")
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
                        aria-label={t("Commit message provider")}
                      >
                        {commitProviders.length === 0 ? (
                          <option value="">
                            {providersLoading ? t("Detecting AI…") : t("No AI provider")}
                          </option>
                        ) : null}
                        {commitProviders.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.name} · {provider.local ? t("local") : t("cloud")}
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
                      {t("Generate")}
                    </button>
                  </div>
                  {!providersLoading && !hasLocalProvider ? (
                    localSetupExpanded ? (
                      <div className="git-local-ai-prompt">
                        <Cpu size={14} />
                        <div className="git-local-ai-copy">
                            <strong>{t("Run locally? Optional.")}</strong>
                          <span>
                            {commitProviders.length > 0
                              ? t("Keep using a cloud provider, or set up Ollama.")
                              : t("Manual commits still work, or set up Ollama.")}
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
                            {t("Not now")}
                          </button>
                          <button onClick={() => void handleOpenLocalAiSetup()}>
                            {t("Setup guide")} <ExternalLink size={10} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="git-local-ai-link"
                        onClick={() => setLocalSetupExpanded(true)}
                      >
                        <Cpu size={10} /> {t("Local AI is optional")}
                      </button>
                    )
                  ) : null}
                  <textarea
                    value={commitMessage}
                    onChange={(event) => setCommitMessage(event.target.value)}
                    placeholder={t("Commit message")}
                    aria-label={t("Commit message")}
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
                    {t("Commit")} {stagedFiles.length || ""}
                  </button>
                </div>
              </>
            ) : null}
              </aside>

              <main className="git-diff-pane">
                <div className="git-diff-header">
                  <div>
                    <strong title={selection?.path}>{selection?.path ?? t("Select a changed file")}</strong>
                    {selection ? (
                      <span>{selection.staged ? t("Staged diff") : t("Working tree diff")}</span>
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
                        title={t("Show history for {{path}}", { path: selection.path })}
                      >
                        <FileClock size={12} /> {t("File history")}
                      </button>
                      <FileStatus status={workspace?.files.find((file) => file.path === selection.path)?.status ?? ""} />
                    </div>
                  ) : null}
                </div>
                <DiffView contents={diff} loading={diffLoading} hasSelection={Boolean(selection)} />
              </main>
            </>
          ) : view === "history" ? (
            <>
              <GitHistoryTimeline
                commits={history}
                selectedHash={selectedCommitHash}
                filePath={historyPath}
                loading={historyLoading}
                hasMore={historyHasMore}
                allBranches={historyAllBranches}
                onSelect={setSelectedCommitHash}
                onShowAll={() => setHistoryPath(null)}
                onToggleAllBranches={() => setHistoryAllBranches((current) => !current)}
                onLoadMore={() =>
                  void loadHistory(false, historyPath, history.length)
                }
              />
              <GitCommitDetailView
                detail={commitDetail}
                loading={detailLoading}
                workingTreeDirty={Boolean(workspace?.files.length)}
                busy={busy}
                confirming={revertConfirmHash === commitDetail?.hash}
                cherryPickConfirming={cherryPickConfirmHash === commitDetail?.hash}
                branchFromCommitOpen={branchFromCommitHash === commitDetail?.hash}
                branchFromCommitDraft={branchFromCommitDraft}
                onRequestRevert={() => {
                  setRevertConfirmHash(commitDetail?.hash ?? null);
                  setCherryPickConfirmHash(null);
                  setBranchFromCommitHash(null);
                }}
                onCancelRevert={() => setRevertConfirmHash(null)}
                onConfirmRevert={() => void handleRevert()}
                onRequestCherryPick={() => {
                  setCherryPickConfirmHash(commitDetail?.hash ?? null);
                  setRevertConfirmHash(null);
                  setBranchFromCommitHash(null);
                }}
                onCancelCherryPick={() => setCherryPickConfirmHash(null)}
                onConfirmCherryPick={() => void handleCherryPick()}
                onRequestBranchFromCommit={() => {
                  setBranchFromCommitHash(commitDetail?.hash ?? null);
                  setRevertConfirmHash(null);
                  setCherryPickConfirmHash(null);
                }}
                onCancelBranchFromCommit={() => {
                  setBranchFromCommitHash(null);
                  setBranchFromCommitDraft("");
                }}
                onBranchFromCommitDraftChange={setBranchFromCommitDraft}
                onConfirmBranchFromCommit={() => void handleCreateBranchFromCommit()}
              />
            </>
          ) : view === "branches" && workspace ? (
            <GitBranchPane
              workspace={workspace}
              busy={busy}
              onCheckout={(branch) => void handleCheckoutBranch(branch)}
              onRename={(branch, nextBranch) => void handleRenameBranch(branch, nextBranch)}
              onDelete={(branch, force) => void handleDeleteBranch(branch, force)}
              onMerge={(branch) => void handleMergeBranch(branch)}
              onRebase={(branch) => void handleRebaseBranch(branch)}
            />
          ) : (
            <GitStashPane
              stashes={workspace?.stashes ?? []}
              changedFileCount={workspace?.files.length ?? 0}
              message={stashMessage}
              includeUntracked={stashIncludeUntracked}
              loading={loading}
              busy={busy}
              dropConfirmReference={dropConfirmReference}
              onMessageChange={setStashMessage}
              onIncludeUntrackedChange={setStashIncludeUntracked}
              onCreate={() => void handleCreateStash()}
              onApply={(stash) => void handleApplyStash(stash, false)}
              onPop={(stash) => void handleApplyStash(stash, true)}
              onDrop={(stash) => void handleDropStash(stash)}
              onCancelDrop={() => setDropConfirmReference(null)}
            />
          )}
        </div>
      </section>
    </div>
  );
}

type BranchConfirmation = {
  action: "merge" | "rebase" | "delete";
  branch: string;
};

function GitBranchPane({
  workspace,
  busy,
  onCheckout,
  onRename,
  onDelete,
  onMerge,
  onRebase,
}: {
  workspace: GitWorkspace;
  busy: string | null;
  onCheckout: (branch: string) => void;
  onRename: (branch: string, nextBranch: string) => void;
  onDelete: (branch: string, force: boolean) => void;
  onMerge: (branch: string) => void;
  onRebase: (branch: string) => void;
}) {
  const { t } = useI18n();
  const [renameDraft, setRenameDraft] = useState(workspace.branch);
  const [confirmation, setConfirmation] = useState<BranchConfirmation | null>(null);
  const [forceDelete, setForceDelete] = useState(false);
  const dirty = workspace.files.length > 0;
  const currentIsLocal = workspace.branches.includes(workspace.branch);

  useEffect(() => {
    setRenameDraft(workspace.branch);
    setConfirmation(null);
    setForceDelete(false);
  }, [workspace.branch]);

  function request(action: BranchConfirmation["action"], branch: string) {
    setConfirmation({ action, branch });
    setForceDelete(false);
  }

  function confirm() {
    if (!confirmation) return;
    if (confirmation.action === "merge") onMerge(confirmation.branch);
    if (confirmation.action === "rebase") onRebase(confirmation.branch);
    if (confirmation.action === "delete") onDelete(confirmation.branch, forceDelete);
    setConfirmation(null);
    setForceDelete(false);
  }

  return (
    <main className="git-branch-pane">
      <header className="git-branch-header">
        <div>
          <span><GitBranch size={12} /> {t("BRANCHES")}</span>
          <h3>{t("Checkout and integrate branches")}</h3>
          <p>{t("Switch context, merge finished work, or rebase the current branch onto a new base.")}</p>
        </div>
        <form
          className="git-branch-rename"
          onSubmit={(event) => {
            event.preventDefault();
            if (renameDraft.trim() && renameDraft.trim() !== workspace.branch) {
              onRename(workspace.branch, renameDraft.trim());
            }
          }}
        >
          <label htmlFor="git-current-branch-name">{t("Current branch")}</label>
          <div>
            <input
              id="git-current-branch-name"
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              disabled={!currentIsLocal || Boolean(busy)}
            />
            <button
              type="submit"
              disabled={
                !currentIsLocal ||
                !renameDraft.trim() ||
                renameDraft.trim() === workspace.branch ||
                Boolean(busy)
              }
            >
              {t("Rename")}
            </button>
          </div>
        </form>
      </header>

      {dirty ? (
        <p className="git-branch-dirty-note">
          <AlertTriangle size={11} />
          {t("Merge and Rebase require a clean working tree. Checkout remains available when Git can carry the changes safely.")}
        </p>
      ) : null}

      <div className="git-branch-sections">
        <section className="git-branch-section">
          <header>
            <span>{t("LOCAL BRANCHES")}</span>
            <strong>{workspace.branches.length}</strong>
          </header>
          <div>
            {workspace.branches.map((branch) => {
              const current = branch === workspace.branch;
              const confirming = confirmation?.branch === branch;
              return (
                <article className="git-branch-row" data-current={current} key={branch}>
                  <span className="git-branch-row-icon"><GitBranch size={13} /></span>
                  <div className="git-branch-row-copy">
                    <strong>{branch}</strong>
                    <span>{current ? t("Checked out") : t("Local branch")}</span>
                  </div>
                  {current ? (
                    <span className="git-current-branch-badge"><Check size={10} /> {t("Current")}</span>
                  ) : confirming ? (
                    <div className="git-branch-confirm">
                      <span>
                        {confirmation.action === "merge"
                          ? t("Merge into {{branch}}?", { branch: workspace.branch })
                          : confirmation.action === "rebase"
                            ? t("Rebase {{branch}} onto this branch?", { branch: workspace.branch })
                            : t("Delete {{branch}}?", { branch })}
                      </span>
                      {confirmation.action === "delete" ? (
                        <label>
                          <input
                            type="checkbox"
                            checked={forceDelete}
                            onChange={(event) => setForceDelete(event.target.checked)}
                          />
                          {t("Delete even if unmerged")}
                        </label>
                      ) : null}
                      <button onClick={() => setConfirmation(null)} disabled={Boolean(busy)}>{t("Cancel")}</button>
                      <button
                        data-danger={confirmation.action === "delete"}
                        onClick={confirm}
                        disabled={Boolean(busy)}
                      >
                        {busy ? <LoaderCircle className="spin" size={10} /> : null}
                        {confirmation.action === "merge"
                          ? t("Merge")
                          : confirmation.action === "rebase"
                            ? t("Rebase")
                            : t("Delete")}
                      </button>
                    </div>
                  ) : (
                    <div className="git-branch-row-actions">
                      <button onClick={() => onCheckout(branch)} disabled={Boolean(busy)}>{t("Checkout")}</button>
                      <button onClick={() => request("merge", branch)} disabled={dirty || Boolean(busy)}>{t("Merge")}</button>
                      <button onClick={() => request("rebase", branch)} disabled={dirty || Boolean(busy)}>{t("Rebase")}</button>
                      <button
                        className="git-branch-delete"
                        onClick={() => request("delete", branch)}
                        disabled={Boolean(busy)}
                        title={t("Delete branch")}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section className="git-branch-section">
          <header>
            <span>{t("REMOTE BRANCHES")}</span>
            <strong>{workspace.remoteBranches.length}</strong>
          </header>
          <div>
            {workspace.remoteBranches.length > 0 ? workspace.remoteBranches.map((branch) => (
              <article className="git-branch-row" key={branch}>
                <span className="git-branch-row-icon" data-remote="true"><GitBranch size={13} /></span>
                <div className="git-branch-row-copy">
                  <strong>{branch}</strong>
                  <span>{t("Checkout creates a local tracking branch")}</span>
                </div>
                <div className="git-branch-row-actions">
                  <button onClick={() => onCheckout(branch)} disabled={Boolean(busy)}>{t("Checkout")}</button>
                </div>
              </article>
            )) : (
              <div className="git-branch-empty">{t("Fetch to discover remote branches.")}</div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function GitStashPane({
  stashes,
  changedFileCount,
  message,
  includeUntracked,
  loading,
  busy,
  dropConfirmReference,
  onMessageChange,
  onIncludeUntrackedChange,
  onCreate,
  onApply,
  onPop,
  onDrop,
  onCancelDrop,
}: {
  stashes: GitStash[];
  changedFileCount: number;
  message: string;
  includeUntracked: boolean;
  loading: boolean;
  busy: string | null;
  dropConfirmReference: string | null;
  onMessageChange: (message: string) => void;
  onIncludeUntrackedChange: (include: boolean) => void;
  onCreate: () => void;
  onApply: (stash: GitStash) => void;
  onPop: (stash: GitStash) => void;
  onDrop: (stash: GitStash) => void;
  onCancelDrop: () => void;
}) {
  const { t } = useI18n();
  const dirty = changedFileCount > 0;
  return (
    <main className="git-stash-pane">
      <header className="git-stash-header">
        <div>
          <span><Archive size={12} /> {t("STASHES")}</span>
          <h3>{t("Set changes aside without committing")}</h3>
          <p>{t("Save the current working tree, switch context, and restore it later.")}</p>
        </div>
        <form
          className="git-stash-create"
          onSubmit={(event) => {
            event.preventDefault();
            onCreate();
          }}
        >
          <input
            value={message}
            onChange={(event) => onMessageChange(event.target.value)}
            placeholder={t("Optional stash message")}
            disabled={Boolean(busy)}
          />
          <label>
            <input
              type="checkbox"
              checked={includeUntracked}
              onChange={(event) => onIncludeUntrackedChange(event.target.checked)}
              disabled={Boolean(busy)}
            />
            {t("Include untracked files")}
          </label>
          <button type="submit" disabled={!dirty || Boolean(busy)}>
            {busy === "stash-create" ? <LoaderCircle className="spin" size={12} /> : <Archive size={12} />}
            {t("Stash {{count}} files", { count: changedFileCount })}
          </button>
        </form>
      </header>

      {loading ? (
        <div className="git-loading-state">
          <LoaderCircle className="spin" size={15} /> {t("Reading stashes")}
        </div>
      ) : stashes.length === 0 ? (
        <div className="git-stash-empty">
          <Archive size={22} />
          <strong>{t("No stashes yet")}</strong>
          <span>{dirty ? t("Use the form above to save these local changes.") : t("Your working tree is clean and there are no saved stashes.")}</span>
        </div>
      ) : (
        <div className="git-stash-list">
          {stashes.map((stash) => {
            const confirmingDrop = dropConfirmReference === stash.reference;
            return (
              <article className="git-stash-row" key={stash.reference}>
                <div className="git-stash-index">{stash.index}</div>
                <div className="git-stash-copy">
                  <strong>{stash.subject}</strong>
                  <span><code>{stash.reference}</code> · {formatCommitDate(stash.createdAt, true)}</span>
                </div>
                {confirmingDrop ? (
                  <div className="git-stash-drop-confirm">
                    <AlertTriangle size={12} />
                    <span>{t("Delete permanently?")}</span>
                    <button onClick={onCancelDrop} disabled={Boolean(busy)}>{t("Cancel")}</button>
                    <button data-danger="true" onClick={() => onDrop(stash)} disabled={Boolean(busy)}>
                      {busy === "stash-drop" ? <LoaderCircle className="spin" size={11} /> : <Trash2 size={11} />}
                      {t("Drop")}
                    </button>
                  </div>
                ) : (
                  <div className="git-stash-actions">
                    <button
                      onClick={() => onApply(stash)}
                      disabled={dirty || Boolean(busy)}
                      title={dirty ? t("Commit or stash current changes first") : t("Restore changes and keep this stash")}
                    >
                      <RotateCcw size={11} /> {t("Apply")}
                    </button>
                    <button
                      onClick={() => onPop(stash)}
                      disabled={dirty || Boolean(busy)}
                      title={dirty ? t("Commit or stash current changes first") : t("Restore changes and remove this stash")}
                    >
                      <Archive size={11} /> {t("Pop")}
                    </button>
                    <button className="git-stash-drop" onClick={() => onDrop(stash)} disabled={Boolean(busy)} title={t("Drop stash")}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      {dirty && stashes.length > 0 ? (
        <p className="git-stash-dirty-note">
          <AlertTriangle size={11} /> {t("Apply and Pop are available after the working tree is clean.")}
        </p>
      ) : null}
    </main>
  );
}

function GitHistoryTimeline({
  commits,
  selectedHash,
  filePath,
  loading,
  hasMore,
  allBranches,
  onSelect,
  onShowAll,
  onToggleAllBranches,
  onLoadMore,
}: {
  commits: GitCommit[];
  selectedHash: string | null;
  filePath: string | null;
  loading: boolean;
  hasMore: boolean;
  allBranches: boolean;
  onSelect: (hash: string) => void;
  onShowAll: () => void;
  onToggleAllBranches: () => void;
  onLoadMore: () => void;
}) {
  const { t } = useI18n();
  return (
    <aside className="git-history-pane">
      <header className="git-history-scope">
        <div>
          <span><History size={11} /> {filePath ? t("FILE HISTORY") : t("RECENT COMMITS")}</span>
          {filePath ? <strong title={filePath}>{filePath}</strong> : null}
        </div>
        <div className="git-history-scope-actions">
          {filePath ? <button onClick={onShowAll}>{t("All commits")}</button> : null}
          <button data-active={allBranches} onClick={onToggleAllBranches}>
            {allBranches ? t("All branches") : t("Current branch")}
          </button>
        </div>
      </header>

      {loading && commits.length === 0 ? (
        <div className="git-loading-state">
          <LoaderCircle className="spin" size={15} /> {t("Reading history")}
        </div>
      ) : commits.length === 0 ? (
        <div className="git-history-empty">
          <GitCommitHorizontal size={18} />
          <strong>{t("No commits found")}</strong>
          <span>{filePath ? t("This file has no committed history yet.") : t("This repository has no commits yet.")}</span>
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
              {t("Load older commits")}
            </button>
          ) : (
            <div className="git-history-end">{t("End of history")}</div>
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
  cherryPickConfirming,
  branchFromCommitOpen,
  branchFromCommitDraft,
  onRequestRevert,
  onCancelRevert,
  onConfirmRevert,
  onRequestCherryPick,
  onCancelCherryPick,
  onConfirmCherryPick,
  onRequestBranchFromCommit,
  onCancelBranchFromCommit,
  onBranchFromCommitDraftChange,
  onConfirmBranchFromCommit,
}: {
  detail: GitCommitDetail | null;
  loading: boolean;
  workingTreeDirty: boolean;
  busy: string | null;
  confirming: boolean;
  cherryPickConfirming: boolean;
  branchFromCommitOpen: boolean;
  branchFromCommitDraft: string;
  onRequestRevert: () => void;
  onCancelRevert: () => void;
  onConfirmRevert: () => void;
  onRequestCherryPick: () => void;
  onCancelCherryPick: () => void;
  onConfirmCherryPick: () => void;
  onRequestBranchFromCommit: () => void;
  onCancelBranchFromCommit: () => void;
  onBranchFromCommitDraftChange: (value: string) => void;
  onConfirmBranchFromCommit: () => void;
}) {
  const { t } = useI18n();
  if (loading) {
    return (
      <main className="git-history-detail">
        <div className="git-diff-empty">
          <LoaderCircle className="spin" size={16} /> {t("Reading commit")}
        </div>
      </main>
    );
  }
  if (!detail) {
    return (
      <main className="git-history-detail">
        <div className="git-diff-empty">
          <GitCommitHorizontal size={19} /> {t("Select a commit to inspect it.")}
        </div>
      </main>
    );
  }

  const mergeCommit = detail.parents.length > 1;
  const operationBusy = Boolean(busy);
  const revertDisabled = mergeCommit || workingTreeDirty || operationBusy;
  const cherryPickDisabled = mergeCommit || workingTreeDirty || operationBusy;
  const revertTitle = mergeCommit
    ? t("Merge commits are view-only because reverting one requires choosing a mainline parent")
    : workingTreeDirty
      ? t("Commit or stash local changes before reverting")
      : t("Create a new commit that reverses this commit");

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
          <div className="git-commit-actions">
            <button
              onClick={onRequestBranchFromCommit}
              disabled={operationBusy}
              title={t("Create a branch starting at this commit")}
            >
              <GitBranch size={12} /> {t("New branch here")}
            </button>
            <button
              onClick={onRequestCherryPick}
              disabled={cherryPickDisabled}
              title={
                mergeCommit
                  ? t("Merge commits cannot be cherry-picked here")
                  : workingTreeDirty
                    ? t("Commit or stash local changes before cherry-picking")
                    : t("Apply this commit onto the current branch")
              }
            >
              <GitCommitHorizontal size={12} /> {t("Cherry-pick")}
            </button>
            <button
              className="git-revert-button"
              onClick={onRequestRevert}
              disabled={revertDisabled}
              title={revertTitle}
            >
              <RotateCcw size={12} /> {t("Revert commit")}
            </button>
          </div>
        </div>
        {detail.body ? <p>{detail.body}</p> : null}
        <div className="git-commit-meta">
          <span><strong>{detail.authorName}</strong> &lt;{detail.authorEmail}&gt;</span>
          <span>{formatCommitDate(detail.authoredAt, false)}</span>
          <code title={detail.hash}>{detail.shortHash}</code>
          {mergeCommit ? <em>{t("Merge · view only")}</em> : null}
        </div>
        {confirming ? (
          <div className="git-revert-confirm">
            <AlertTriangle size={14} />
            <div>
              <strong>{t("Reverse {{hash}} with a new commit?", { hash: detail.shortHash })}</strong>
              <span>{t("History stays intact. If Git finds a conflict, Runbox aborts the revert.")}</span>
            </div>
            <button onClick={onCancelRevert} disabled={operationBusy}>{t("Cancel")}</button>
            <button onClick={onConfirmRevert} disabled={operationBusy}>
              {busy === "revert" ? <LoaderCircle className="spin" size={11} /> : <RotateCcw size={11} />}
              {t("Create revert")}
            </button>
          </div>
        ) : null}
        {cherryPickConfirming ? (
          <div className="git-commit-confirm">
            <GitCommitHorizontal size={14} />
            <div>
              <strong>{t("Cherry-pick {{hash}} onto the current branch?", { hash: detail.shortHash })}</strong>
              <span>{t("If Git finds a conflict, Runbox aborts the cherry-pick and restores the branch.")}</span>
            </div>
            <button onClick={onCancelCherryPick} disabled={operationBusy}>{t("Cancel")}</button>
            <button onClick={onConfirmCherryPick} disabled={operationBusy}>
              {busy === "cherry-pick" ? <LoaderCircle className="spin" size={11} /> : <Check size={11} />}
              {t("Cherry-pick")}
            </button>
          </div>
        ) : null}
        {branchFromCommitOpen ? (
          <form
            className="git-branch-from-commit"
            onSubmit={(event) => {
              event.preventDefault();
              onConfirmBranchFromCommit();
            }}
          >
            <GitBranch size={14} />
            <div>
              <strong>{t("Create a branch from {{hash}}", { hash: detail.shortHash })}</strong>
              <span>{t("The new branch is created at this commit and checked out immediately.")}</span>
            </div>
            <input
              value={branchFromCommitDraft}
              onChange={(event) => onBranchFromCommitDraftChange(event.target.value)}
              placeholder={t("New branch name")}
              autoFocus
              disabled={operationBusy}
            />
            <button type="button" onClick={onCancelBranchFromCommit} disabled={operationBusy}>
              {t("Cancel")}
            </button>
            <button type="submit" disabled={!branchFromCommitDraft.trim() || operationBusy}>
              {busy === "branch-from-commit" ? <LoaderCircle className="spin" size={11} /> : <Plus size={11} />}
              {t("Create and checkout")}
            </button>
          </form>
        ) : null}
      </header>

      <section className="git-commit-files">
        <header>
          <span>{t("FILES")} <strong>{detail.files.length}</strong></span>
          {detail.patchTruncated ? <em>{t("Patch truncated")}</em> : null}
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
        <span>{t("PATCH")}</span>
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
  confirmingDiscardPath,
  onDiscard,
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
  confirmingDiscardPath: string | null;
  onDiscard: (path: string) => void;
}) {
  const { t } = useI18n();
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
          const confirmingDiscard = confirmingDiscardPath === file.path;
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
                aria-label={`${staged ? t("Unstage") : t("Stage")} ${file.path}`}
                title={staged ? t("Unstage file") : t("Stage file")}
              >
                {staged ? <Minus size={12} /> : <Plus size={12} />}
              </button>
              <button
                className="git-discard-toggle"
                data-confirming={confirmingDiscard}
                onClick={() => onDiscard(file.path)}
                disabled={actionDisabled}
                aria-label={
                  confirmingDiscard
                    ? t("Confirm discard {{path}}", { path: file.path })
                    : t("Discard changes in {{path}}", { path: file.path })
                }
                title={
                  confirmingDiscard
                    ? t("Click again to discard all changes in this file")
                    : t("Discard file changes")
                }
              >
                <Trash2 size={11} />
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
  const { t } = useI18n();
  const lines = useMemo(() => contents.split("\n"), [contents]);
  if (loading) {
    return <div className="git-diff-empty"><LoaderCircle className="spin" size={16} /> {t("Reading diff")}</div>;
  }
  if (!hasSelection) {
    return <div className="git-diff-empty"><GitCommitHorizontal size={19} /> {t("Select a file to review its changes.")}</div>;
  }
  if (!contents.trim()) {
    return <div className="git-diff-empty">{t("No textual diff for this file.")}</div>;
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
