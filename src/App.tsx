import {
  type DragEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Activity,
  ArrowDownUp,
  CircleStop,
  Command,
  FolderOpen,
  LayoutGrid,
  Plus,
  Search,
  Star,
  Tag,
  Terminal,
  X,
} from "lucide-react";
import { LogPanel } from "./components/LogPanel";
import { ProjectCard } from "./components/ProjectCard";
import { ProjectModal } from "./components/ProjectModal";
import {
  clearProjectLog,
  deleteProject,
  getProjects,
  openProjectFolder,
  openProjectTerminal,
  readProjectLog,
  refreshFinderColors,
  reorderProjects,
  saveProject,
  setProjectFavorite,
  startProject,
  stopProject,
} from "./lib/backend";
import { commandTag, type CommandTag } from "./lib/projectMeta";
import type { Project, ProjectForm, ProjectView } from "./types";
import "./App.css";

type Filter = "all" | "favorites" | "running" | "stopped";
type SortMode = "manual" | "recent" | "name";
type TagFilter = "all" | CommandTag;
type Toast = { id: number; message: string; tone: "success" | "error" };

const EMPTY_FORM: ProjectForm = {
  id: "",
  name: "",
  path: "",
  command: "",
  favorite: false,
  sortOrder: 0,
};

const TAG_OPTIONS: Array<{ value: TagFilter; label: string }> = [
  { value: "all", label: "All tools" },
  { value: "pnpm", label: "pnpm" },
  { value: "npm", label: "npm" },
  { value: "bun", label: "Bun" },
  { value: "docker", label: "Docker" },
  { value: "rust", label: "Rust" },
  { value: "python", label: "Python" },
  { value: "other", label: "Other" },
];

export default function App() {
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    const saved = window.localStorage.getItem("runbox.sortMode");
    return saved === "manual" || saved === "name" ? saved : "recent";
  });
  const [tagFilter, setTagFilter] = useState<TagFilter>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [favoritePendingIds, setFavoritePendingIds] = useState<Set<string>>(() => new Set());
  const [modalProject, setModalProject] = useState<ProjectForm | null>(null);
  const [logProjectId, setLogProjectId] = useState<string | null>(null);
  const [logContents, setLogContents] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = useCallback((message: string, tone: Toast["tone"]) => {
    const nextToast = { id: Date.now(), message, tone };
    setToast(nextToast);
    window.setTimeout(() => {
      setToast((current) => (current?.id === nextToast.id ? null : current));
    }, 3_000);
  }, []);

  const refreshProjects = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoading(true);
      try {
        setProjects(await getProjects());
      } catch (error) {
        showToast(errorMessage(error), "error");
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [showToast],
  );

  useEffect(() => {
    void refreshProjects(true);
    const interval = window.setInterval(() => void refreshProjects(), 1_200);
    return () => window.clearInterval(interval);
  }, [refreshProjects]);

  useEffect(() => {
    window.localStorage.setItem("runbox.sortMode", sortMode);
  }, [sortMode]);

  useEffect(() => {
    if (!logProjectId) {
      setLogContents("");
      return;
    }
    const updateLog = async () => {
      try {
        setLogContents(await readProjectLog(logProjectId, 300));
      } catch (error) {
        showToast(errorMessage(error), "error");
      }
    };
    void updateLog();
    const interval = window.setInterval(updateLog, 700);
    return () => window.clearInterval(interval);
  }, [logProjectId, showToast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>("#project-search")?.focus();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setModalProject(EMPTY_FORM);
      }
      if (event.key === "Escape") {
        setModalProject(null);
        setLogProjectId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const runningCount = useMemo(
    () => projects.reduce((count, project) => count + Number(project.status === "running"), 0),
    [projects],
  );
  const favoriteCount = useMemo(
    () => projects.reduce((count, project) => count + Number(project.favorite), 0),
    [projects],
  );
  const finderTagCount = useMemo(
    () => projects.reduce((count, project) => count + Number(Boolean(project.finderTagColor)), 0),
    [projects],
  );
  const commonProjectRoot = useMemo(
    () => commonDirectory(projects.map((project) => project.path)),
    [projects],
  );

  const visibleProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = projects.filter((project) => {
      if (!matchesFilter(project, filter)) return false;
      if (tagFilter !== "all" && commandTag(project.command) !== tagFilter) return false;
      if (!normalizedQuery) return true;
      return [project.name, project.path, project.command].some((value) =>
        value.toLowerCase().includes(normalizedQuery),
      );
    });
    return sortProjects(filtered, sortMode);
  }, [filter, projects, query, sortMode, tagFilter]);

  const logProject = projects.find((project) => project.id === logProjectId) ?? null;
  const canReorder =
    sortMode === "manual" && filter === "all" && tagFilter === "all" && query.trim() === "";

  async function withPending(projectId: string, action: () => Promise<unknown>) {
    setPendingIds((current) => new Set(current).add(projectId));
    try {
      await action();
      await refreshProjects();
    } catch (error) {
      showToast(errorMessage(error), "error");
    } finally {
      setPendingIds((current) => withoutId(current, projectId));
    }
  }

  async function handleToggle(project: ProjectView) {
    const running = project.status === "running";
    await withPending(project.id, async () => {
      if (running) {
        await stopProject(project.id);
        showToast(`${project.name} stopped`, "success");
      } else {
        await startProject(project.id);
        setLogProjectId(project.id);
        showToast(`${project.name} started`, "success");
      }
    });
  }

  async function handleFavorite(project: ProjectView) {
    if (favoritePendingIds.has(project.id)) return;
    const favorite = !project.favorite;
    setFavoritePendingIds((current) => new Set(current).add(project.id));
    setProjects((current) =>
      current.map((item) => (item.id === project.id ? { ...item, favorite } : item)),
    );
    try {
      await setProjectFavorite(project.id, favorite);
      await refreshProjects();
    } catch (error) {
      await refreshProjects();
      showToast(errorMessage(error), "error");
    } finally {
      setFavoritePendingIds((current) => withoutId(current, project.id));
    }
  }

  async function handleSave(form: ProjectForm) {
    try {
      const project: Project = await saveProject(form);
      setModalProject(null);
      await refreshProjects();
      showToast(`${project.name} saved`, "success");
    } catch (error) {
      showToast(errorMessage(error), "error");
      throw error;
    }
  }

  async function handleDelete(project: ProjectForm) {
    try {
      await deleteProject(project.id);
      setModalProject(null);
      if (logProjectId === project.id) setLogProjectId(null);
      await refreshProjects();
      showToast(`${project.name} removed`, "success");
    } catch (error) {
      showToast(errorMessage(error), "error");
      throw error;
    }
  }

  function handleDragStart(event: DragEvent<HTMLElement>, projectId: string) {
    if (!canReorder) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", projectId);
    setDraggedId(projectId);
  }

  function handleDragOver(event: DragEvent<HTMLElement>, projectId: string) {
    if (!canReorder || projectId === draggedId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTargetId(projectId);
  }

  async function handleDrop(event: DragEvent<HTMLElement>, targetId: string) {
    event.preventDefault();
    if (!draggedId || draggedId === targetId) {
      clearDragState();
      return;
    }

    const manualProjects = sortProjects(projects, "manual");
    const source = manualProjects.find((project) => project.id === draggedId);
    const target = manualProjects.find((project) => project.id === targetId);
    if (!source || !target || source.favorite !== target.favorite) {
      clearDragState();
      showToast("Pinned and unpinned projects are ordered separately", "error");
      return;
    }

    const sourceIndex = manualProjects.findIndex((project) => project.id === draggedId);
    const targetIndex = manualProjects.findIndex((project) => project.id === targetId);
    const reordered = [...manualProjects];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    const withOrder = reordered.map((project, index) => ({ ...project, sortOrder: index * 100 }));
    setProjects(withOrder);
    clearDragState();

    try {
      await reorderProjects(withOrder.map((project) => project.id));
    } catch (error) {
      await refreshProjects();
      showToast(errorMessage(error), "error");
    }
  }

  function clearDragState() {
    setDraggedId(null);
    setDropTargetId(null);
  }

  function clearFilters() {
    setQuery("");
    setFilter("all");
    setTagFilter("all");
  }

  async function grantFinderAccess() {
    try {
      const path = await open({
        directory: true,
        multiple: false,
        title: "Choose the folder that contains your projects",
        defaultPath: commonProjectRoot,
      });
      if (!path) return;
      await refreshFinderColors();
      showToast("Finder colors enabled", "success");
      window.setTimeout(() => void refreshProjects(), 300);
    } catch (error) {
      showToast(errorMessage(error), "error");
    }
  }

  return (
    <div className="app-shell">
      <div className="window-drag-region" data-tauri-drag-region />
      <aside className="sidebar">
        <div className="brand" aria-label="Runbox">
          <span className="brand-mark"><Terminal size={17} strokeWidth={2.2} /></span>
          <span>runbox<span className="brand-cursor">_</span></span>
        </div>
        <nav className="nav-list" aria-label="Project filters">
          <FilterButton
            active={filter === "all"}
            icon={<LayoutGrid size={15} />}
            label="All projects"
            count={projects.length}
            onClick={() => setFilter("all")}
          />
          <FilterButton
            active={filter === "favorites"}
            icon={<Star size={15} />}
            label="Pinned"
            count={favoriteCount}
            onClick={() => setFilter("favorites")}
          />
          <FilterButton
            active={filter === "running"}
            icon={<Activity size={15} />}
            label="Running"
            count={runningCount}
            onClick={() => setFilter("running")}
            accent
          />
          <FilterButton
            active={filter === "stopped"}
            icon={<CircleStop size={15} />}
            label="Stopped"
            count={projects.length - runningCount}
            onClick={() => setFilter("stopped")}
          />
        </nav>
        <div className="sidebar-spacer" />
        <div className="cli-hint">
          <div className="cli-hint-label">TERMINAL SHORTCUT</div>
          <code><span>$</span> p &lt;project&gt;</code>
          <p>Same projects. Same status.</p>
        </div>
        <button className="sidebar-add-button" onClick={() => setModalProject(EMPTY_FORM)}>
          <Plus size={15} /> Add project <kbd>⌘N</kbd>
        </button>
      </aside>

      <main className="main-content">
        <header className="content-header">
          <div>
            <p className="eyebrow">LOCAL WORKSPACE</p>
            <h1>{filterTitle(filter)}</h1>
          </div>
          <div className="header-actions">
            <label className="search-control" htmlFor="project-search">
              <Search size={15} />
              <input
                id="project-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                autoComplete="off"
              />
              {query ? (
                <button aria-label="Clear search" onClick={() => setQuery("")}><X size={13} /></button>
              ) : <kbd>⌘K</kbd>}
            </label>
            <button className="primary-button" onClick={() => setModalProject(EMPTY_FORM)}>
              <Plus size={15} /> New project
            </button>
          </div>
        </header>

        <section className="project-toolbar" aria-label="Project controls">
          <div className="project-summary">
            <span><strong>{visibleProjects.length}</strong> shown</span>
            <span className="summary-separator">/</span>
            <span className={runningCount > 0 ? "summary-running" : ""}>
              <i />{runningCount} running
            </span>
            <span className="summary-separator">/</span>
            <span><Star size={10} />{favoriteCount} pinned</span>
          </div>
          <div className="toolbar-controls">
            {projects.length > 0 && finderTagCount === 0 && isMac() ? (
              <button className="finder-access-button" onClick={() => void grantFinderAccess()}>
                <span><i /><i /><i /></span> Finder colors
              </button>
            ) : null}
            {sortMode === "manual" ? (
              <span className="reorder-hint" data-enabled={canReorder}>
                {canReorder ? "Drag cards to reorder" : "Clear filters to reorder"}
              </span>
            ) : null}
            <label className="select-control">
              <Tag size={13} />
              <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value as TagFilter)}>
                {TAG_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="select-control">
              <ArrowDownUp size={13} />
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                <option value="recent">Last opened</option>
                <option value="manual">Manual order</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>
        </section>

        <div className="project-scroll-area">
          {loading ? (
            <div className="loading-state"><span className="loading-cursor">▋</span> reading projects</div>
          ) : visibleProjects.length > 0 ? (
            <div className="project-grid">
              {visibleProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  pending={pendingIds.has(project.id)}
                  favoritePending={favoritePendingIds.has(project.id)}
                  canReorder={canReorder}
                  dragging={draggedId === project.id}
                  dropTarget={dropTargetId === project.id}
                  onToggle={() => void handleToggle(project)}
                  onFavorite={() => void handleFavorite(project)}
                  onLogs={() => setLogProjectId(project.id)}
                  onEdit={() => setModalProject(project)}
                  onOpenFolder={() => void openProjectFolder(project.id).catch((error) => showToast(errorMessage(error), "error"))}
                  onOpenTerminal={() => void openProjectTerminal(project.id).catch((error) => showToast(errorMessage(error), "error"))}
                  onDragStart={(event) => handleDragStart(event, project.id)}
                  onDragOver={(event) => handleDragOver(event, project.id)}
                  onDrop={(event) => void handleDrop(event, project.id)}
                  onDragEnd={clearDragState}
                />
              ))}
            </div>
          ) : (
            <EmptyState filtered={projects.length > 0} onAdd={() => setModalProject(EMPTY_FORM)} onClear={clearFilters} />
          )}
        </div>
      </main>

      {modalProject ? (
        <ProjectModal
          project={modalProject}
          onClose={() => setModalProject(null)}
          onSave={handleSave}
          onDelete={modalProject.id ? handleDelete : undefined}
        />
      ) : null}
      {logProject ? (
        <LogPanel
          project={logProject}
          contents={logContents}
          onClose={() => setLogProjectId(null)}
          onClear={() => void clearProjectLog(logProject.id).then(() => setLogContents("")).catch((error) => showToast(errorMessage(error), "error"))}
        />
      ) : null}
      {toast ? (
        <div className="toast" data-tone={toast.tone} role="status">
          <span>{toast.tone === "success" ? "✓" : "!"}</span>{toast.message}
        </div>
      ) : null}
    </div>
  );
}

function FilterButton({
  active,
  icon,
  label,
  count,
  onClick,
  accent = false,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  count: number;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button className="nav-item" data-active={active} onClick={onClick}>
      {icon}<span>{label}</span>
      <span className={accent ? "nav-count running-count" : "nav-count"}>{count}</span>
    </button>
  );
}

function EmptyState({ filtered, onAdd, onClear }: { filtered: boolean; onAdd: () => void; onClear: () => void }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Command size={21} /></div>
      <h2>{filtered ? "No matching projects" : "Your commands, one click away."}</h2>
      <p>{filtered ? "Try another filter or show all projects." : "Add a project folder. Runbox will detect the usual dev command for you."}</p>
      <button className="secondary-button" onClick={filtered ? onClear : onAdd}>
        {filtered ? "Clear filters" : <><FolderOpen size={15} /> Choose a folder</>}
      </button>
    </div>
  );
}

function matchesFilter(project: ProjectView, filter: Filter): boolean {
  if (filter === "favorites") return project.favorite;
  if (filter === "running") return project.status === "running";
  if (filter === "stopped") return project.status === "stopped";
  return true;
}

function sortProjects(projects: ProjectView[], sortMode: SortMode): ProjectView[] {
  return [...projects].sort((left, right) => {
    const favoriteOrder = Number(right.favorite) - Number(left.favorite);
    if (favoriteOrder !== 0) return favoriteOrder;
    if (sortMode === "name") return left.name.localeCompare(right.name);
    if (sortMode === "recent") {
      const recentOrder = (right.startedAt ?? 0) - (left.startedAt ?? 0);
      if (recentOrder !== 0) return recentOrder;
    }
    return left.sortOrder - right.sortOrder || left.name.localeCompare(right.name);
  });
}

function filterTitle(filter: Filter): string {
  if (filter === "favorites") return "Pinned";
  if (filter === "running") return "Running";
  if (filter === "stopped") return "Stopped";
  return "Projects";
}

function withoutId(values: Set<string>, projectId: string): Set<string> {
  const next = new Set(values);
  next.delete(projectId);
  return next;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function commonDirectory(paths: string[]): string | undefined {
  if (paths.length === 0) return undefined;
  const segments = paths.map((path) => path.split("/").filter(Boolean));
  const shortest = Math.min(...segments.map((path) => path.length));
  let sharedLength = 0;

  while (
    sharedLength < shortest &&
    segments.every((path) => path[sharedLength] === segments[0][sharedLength])
  ) {
    sharedLength += 1;
  }
  return sharedLength > 0 ? `/${segments[0].slice(0, sharedLength).join("/")}` : undefined;
}

function isMac(): boolean {
  return navigator.userAgent.includes("Macintosh");
}
