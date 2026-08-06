import {
  type DragEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Activity,
  ArrowDownUp,
  CircleStop,
  Command,
  FolderOpen,
  GitBranch,
  Grid2X2,
  GripHorizontal,
  Layers3,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Rows3,
  Search,
  Settings2,
  Star,
  Tag,
  TableProperties,
  Terminal,
  X,
} from "lucide-react";
import { DeveloperToolsPanel } from "./components/DeveloperToolsPanel";
import { GitPanel } from "./components/GitPanel";
import { PreferencesPanel } from "./components/PreferencesPanel";
import { ProjectCard } from "./components/ProjectCard";
import { ProjectContextMenu } from "./components/ProjectContextMenu";
import { ProjectModal } from "./components/ProjectModal";
import { ProjectTasksPanel } from "./components/ProjectTasksPanel";
import { ProjectTable } from "./components/ProjectTable";
import { WorkspaceGroupsPanel } from "./components/WorkspaceGroupsPanel";
import {
  deleteProject,
  getProjects,
  getProjectTasks,
  getWorkspaceGroups,
  openProjectFolder,
  openProjectTaskPort,
  openProjectTerminal,
  refreshFinderColors,
  reorderProjects,
  saveProject,
  setProjectFavorite,
  startProject,
  stopProject,
} from "./lib/backend";
import { commandTag, type CommandTag } from "./lib/projectMeta";
import {
  applyPreferences,
  loadPreferences,
  savePreferences,
  updateUiScale,
} from "./lib/preferences";
import type { Project, ProjectEndpoint, ProjectForm, ProjectView } from "./types";
import "./App.css";

type Filter = "all" | "favorites" | "running" | "stopped" | "gitChanges";
type SortMode = "manual" | "recent" | "name";
type TagFilter = "all" | CommandTag;
type ViewMode = "comfortable" | "compact" | "table";
type Toast = { id: number; message: string; tone: "success" | "error" };
type ProjectMenuState = { projectId: string; x: number; y: number };

const EMPTY_FORM: ProjectForm = {
  id: "",
  name: "",
  path: "",
  command: "",
  tasks: [
    {
      id: "default",
      name: "Dev",
      command: "",
      autoStart: true,
      dependsOn: [],
      readiness: { kind: "process", value: "", timeoutSeconds: 30 },
    },
  ],
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
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = window.localStorage.getItem("runbox.viewMode");
    return saved === "compact" || saved === "table" ? saved : "comfortable";
  });
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [favoritePendingIds, setFavoritePendingIds] = useState<Set<string>>(() => new Set());
  const [modalProject, setModalProject] = useState<ProjectForm | null>(null);
  const [taskProjectId, setTaskProjectId] = useState<string | null>(null);
  const [gitProjectId, setGitProjectId] = useState<string | null>(null);
  const [toolsProjectId, setToolsProjectId] = useState<string | null>(null);
  const [workspaceGroupsOpen, setWorkspaceGroupsOpen] = useState(false);
  const [workspaceGroupCount, setWorkspaceGroupCount] = useState(0);
  const [projectEndpoints, setProjectEndpoints] = useState<Record<string, ProjectEndpoint[]>>({});
  const [preferences, setPreferences] = useState(loadPreferences);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [projectMenu, setProjectMenu] = useState<ProjectMenuState | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => window.localStorage.getItem("runbox.sidebarCollapsed") === "true",
  );
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

  const closeProjectMenu = useCallback(() => setProjectMenu(null), []);

  const startWindowDrag = useCallback(() => {
    void getCurrentWindow().startDragging().catch((error) => {
      console.error("Failed to start window drag", error);
    });
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
    window.localStorage.setItem("runbox.viewMode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    window.localStorage.setItem("runbox.sidebarCollapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    savePreferences(preferences);
    void applyPreferences(preferences).catch((error) => {
      console.error("Failed to apply interface preferences", error);
    });
  }, [preferences]);

  useEffect(() => {
    async function refreshWorkspaceGroupCount() {
      try {
        setWorkspaceGroupCount((await getWorkspaceGroups()).length);
      } catch (error) {
        console.error("Failed to read workspace groups", error);
      }
    }
    void refreshWorkspaceGroupCount();
    const interval = window.setInterval(refreshWorkspaceGroupCount, 3_000);
    return () => window.clearInterval(interval);
  }, []);

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
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setSidebarCollapsed((current) => !current);
      }
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault();
        setPreferencesOpen(true);
      }
      if ((event.metaKey || event.ctrlKey) && (event.key === "=" || event.key === "+")) {
        event.preventDefault();
        setPreferences((current) => updateUiScale(current, current.scale + 0.05));
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "-") {
        event.preventDefault();
        setPreferences((current) => updateUiScale(current, current.scale - 0.05));
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "0") {
        event.preventDefault();
        setPreferences((current) => updateUiScale(current, 1));
      }
      if (event.key === "Escape") {
        setProjectMenu(null);
        setModalProject(null);
        setTaskProjectId(null);
        setGitProjectId(null);
        setToolsProjectId(null);
        setWorkspaceGroupsOpen(false);
        setPreferencesOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const runningCount = useMemo(
    () => projects.reduce((count, project) => count + Number(project.status === "running"), 0),
    [projects],
  );
  const activeTaskCount = useMemo(
    () => projects.reduce((count, project) => count + project.runningTaskCount, 0),
    [projects],
  );
  const favoriteCount = useMemo(
    () => projects.reduce((count, project) => count + Number(project.favorite), 0),
    [projects],
  );
  const gitChangesCount = useMemo(
    () => projects.reduce((count, project) => count + Number(project.gitStatus?.dirty ?? false), 0),
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
      return [
        project.name,
        project.path,
        project.command,
        ...project.tasks.flatMap((task) => [task.name, task.command]),
      ].some((value) =>
        value.toLowerCase().includes(normalizedQuery),
      );
    });
    return sortProjects(filtered, sortMode);
  }, [filter, projects, query, sortMode, tagFilter]);

  const runningProjectKey = useMemo(
    () => projects
      .filter((project) => project.status === "running")
      .map((project) => project.id)
      .sort()
      .join("|"),
    [projects],
  );

  useEffect(() => {
    const projectIds = runningProjectKey ? runningProjectKey.split("|") : [];
    let cancelled = false;

    if (projectIds.length === 0) {
      setProjectEndpoints({});
      return;
    }

    async function refreshEndpoints() {
      const entries = await Promise.all(
        projectIds.map(async (projectId): Promise<[string, ProjectEndpoint[]]> => {
          try {
            const tasks = await getProjectTasks(projectId);
            const endpoints = tasks
              .flatMap((task) =>
                task.ports.map((port) => ({
                  ...port,
                  taskId: task.id,
                  taskName: task.name,
                })),
              )
              .sort((left, right) => left.port - right.port);
            return [projectId, endpoints];
          } catch (error) {
            console.error(`Failed to detect project endpoints for ${projectId}`, error);
            return [projectId, []];
          }
        }),
      );
      if (!cancelled) setProjectEndpoints(Object.fromEntries(entries));
    }

    void refreshEndpoints();
    const interval = window.setInterval(refreshEndpoints, 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [runningProjectKey]);

  const taskProject = projects.find((project) => project.id === taskProjectId) ?? null;
  const gitProject = projects.find((project) => project.id === gitProjectId) ?? null;
  const toolsProject = projects.find((project) => project.id === toolsProjectId) ?? null;
  const menuProject = projects.find((project) => project.id === projectMenu?.projectId) ?? null;
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
        setTaskProjectId(project.id);
        showToast(`${project.name} tasks started`, "success");
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

  async function copyProjectValue(value: string, label: string) {
    try {
      await writeClipboardText(value);
      showToast(`${label} copied`, "success");
    } catch (error) {
      showToast(errorMessage(error), "error");
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
      if (taskProjectId === project.id) setTaskProjectId(null);
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
    <div className="app-shell" data-sidebar-collapsed={sidebarCollapsed}>
      <div className="window-drag-region" data-tauri-drag-region>
        <button
          type="button"
          className="window-drag-handle"
          aria-label="Drag to move window"
          data-tauri-drag-region
          onMouseDown={(event) => {
            if (event.button === 0) startWindowDrag();
          }}
        >
          <GripHorizontal size={18} strokeWidth={2} />
        </button>
      </div>
      <aside className="sidebar">
        <button
          type="button"
          className="sidebar-collapse-button"
          onClick={() => setSidebarCollapsed((current) => !current)}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={`${sidebarCollapsed ? "Expand" : "Collapse"} sidebar (⌘B)`}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={13} /> : <PanelLeftClose size={13} />}
        </button>
        <div className="brand" aria-label="Runbox">
          <span className="brand-mark"><Terminal size={17} strokeWidth={2.2} /></span>
          <span className="brand-name">runbox<span className="brand-cursor">_</span></span>
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
            active={filter === "gitChanges"}
            icon={<GitBranch size={15} />}
            label="Git changes"
            count={gitChangesCount}
            onClick={() => setFilter("gitChanges")}
          />
          <FilterButton
            active={filter === "stopped"}
            icon={<CircleStop size={15} />}
            label="Stopped"
            count={projects.length - runningCount}
            onClick={() => setFilter("stopped")}
          />
        </nav>
        <div className="sidebar-section-label">WORKSPACES</div>
        <button
          className="sidebar-workspaces-button"
          onClick={() => setWorkspaceGroupsOpen(true)}
          title="Workspace groups"
        >
          <Layers3 size={15} />
          <span>Workspace groups</span>
          <strong>{workspaceGroupCount}</strong>
        </button>
        <div className="sidebar-spacer" />
        <button
          className="sidebar-settings-button"
          onClick={() => setPreferencesOpen(true)}
          title="Preferences"
        >
          <Settings2 size={14} />
          <span>Preferences</span>
          <kbd>⌘,</kbd>
        </button>
        <div className="cli-hint">
          <div className="cli-hint-label">TERMINAL SHORTCUT</div>
          <code><span>$</span> p &lt;project&gt;</code>
          <p>Same projects. Same status.</p>
        </div>
        <button
          className="sidebar-add-button"
          onClick={() => setModalProject(EMPTY_FORM)}
          title="Add project"
        >
          <Plus size={15} /> <span>Add project</span> <kbd>⌘N</kbd>
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
              <i />{activeTaskCount} tasks running
            </span>
            <span className="summary-separator">/</span>
            <span className={gitChangesCount > 0 ? "summary-git" : ""}>
              <GitBranch size={10} />{gitChangesCount} changed
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
                {canReorder ? "Drag projects to reorder" : "Clear filters to reorder"}
              </span>
            ) : null}
            <div className="view-switcher" role="group" aria-label="Project view">
              <ViewButton
                active={viewMode === "comfortable"}
                icon={<Rows3 size={13} />}
                label="Comfortable view"
                onClick={() => setViewMode("comfortable")}
              />
              <ViewButton
                active={viewMode === "compact"}
                icon={<Grid2X2 size={13} />}
                label="Compact view"
                onClick={() => setViewMode("compact")}
              />
              <ViewButton
                active={viewMode === "table"}
                icon={<TableProperties size={13} />}
                label="Table view"
                onClick={() => setViewMode("table")}
              />
            </div>
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
            viewMode === "table" ? (
              <ProjectTable
                projects={visibleProjects}
                projectEndpoints={projectEndpoints}
                pendingIds={pendingIds}
                favoritePendingIds={favoritePendingIds}
                canReorder={canReorder}
                draggedId={draggedId}
                dropTargetId={dropTargetId}
                onToggle={(project) => void handleToggle(project)}
                onFavorite={(project) => void handleFavorite(project)}
                onGit={(project) => setGitProjectId(project.id)}
                onOpenEndpoint={(project, endpoint) =>
                  void openProjectTaskPort(project.id, endpoint.taskId, endpoint.port).catch(
                    (error) => showToast(errorMessage(error), "error"),
                  )
                }
                onOpenMenu={(project, position) =>
                  setProjectMenu({ projectId: project.id, ...position })
                }
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={(event, projectId) => void handleDrop(event, projectId)}
                onDragEnd={clearDragState}
              />
            ) : (
              <div className="project-grid" data-view={viewMode}>
                {visibleProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    endpoints={projectEndpoints[project.id] ?? []}
                    pending={pendingIds.has(project.id)}
                    favoritePending={favoritePendingIds.has(project.id)}
                    canReorder={canReorder}
                    dragging={draggedId === project.id}
                    dropTarget={dropTargetId === project.id}
                    onToggle={() => void handleToggle(project)}
                    onFavorite={() => void handleFavorite(project)}
                    onLogs={() => setTaskProjectId(project.id)}
                    onGit={() => setGitProjectId(project.id)}
                    onEdit={() => setModalProject(project)}
                    onOpenFolder={() =>
                      void openProjectFolder(project.id).catch((error) =>
                        showToast(errorMessage(error), "error"),
                      )
                    }
                    onOpenTerminal={() =>
                      void openProjectTerminal(project.id).catch((error) =>
                        showToast(errorMessage(error), "error"),
                      )
                    }
                    onOpenEndpoint={(endpoint) =>
                      void openProjectTaskPort(project.id, endpoint.taskId, endpoint.port).catch(
                        (error) => showToast(errorMessage(error), "error"),
                      )
                    }
                    onOpenMenu={(position) =>
                      setProjectMenu({ projectId: project.id, ...position })
                    }
                    onDragStart={(event) => handleDragStart(event, project.id)}
                    onDragOver={(event) => handleDragOver(event, project.id)}
                    onDrop={(event) => void handleDrop(event, project.id)}
                    onDragEnd={clearDragState}
                  />
                ))}
              </div>
            )
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
      {taskProject ? (
        <ProjectTasksPanel
          project={taskProject}
          onClose={() => setTaskProjectId(null)}
          onProjectRefresh={() => void refreshProjects()}
          onNotify={showToast}
        />
      ) : null}
      {workspaceGroupsOpen ? (
        <WorkspaceGroupsPanel
          projects={projects}
          onClose={() => setWorkspaceGroupsOpen(false)}
          onProjectRefresh={() => void refreshProjects()}
          onGroupCountChange={setWorkspaceGroupCount}
          onNotify={showToast}
        />
      ) : null}
      {gitProject ? (
        <GitPanel
          project={gitProject}
          onClose={() => setGitProjectId(null)}
          onProjectRefresh={() => void refreshProjects()}
          onNotify={showToast}
        />
      ) : null}
      {toolsProject ? (
        <DeveloperToolsPanel
          project={toolsProject}
          onClose={() => setToolsProjectId(null)}
          onNotify={showToast}
        />
      ) : null}
      {preferencesOpen ? (
        <PreferencesPanel
          preferences={preferences}
          onChange={setPreferences}
          onClose={() => setPreferencesOpen(false)}
        />
      ) : null}
      {projectMenu && menuProject ? (
        <ProjectContextMenu
          project={menuProject}
          position={projectMenu}
          onClose={closeProjectMenu}
          onCopyPath={() => void copyProjectValue(menuProject.path, "Project path")}
          onTasks={() => setTaskProjectId(menuProject.id)}
          onTools={() => setToolsProjectId(menuProject.id)}
          onOpenFolder={() =>
            void openProjectFolder(menuProject.id).catch((error) =>
              showToast(errorMessage(error), "error"),
            )
          }
          onOpenTerminal={() =>
            void openProjectTerminal(menuProject.id).catch((error) =>
              showToast(errorMessage(error), "error"),
            )
          }
          onEdit={() => setModalProject(menuProject)}
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

function ViewButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="view-button"
      data-active={active}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
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
    <button className="nav-item" data-active={active} onClick={onClick} title={label}>
      {icon}<span className="nav-label">{label}</span>
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
  if (filter === "gitChanges") return project.gitStatus?.dirty ?? false;
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
  if (filter === "gitChanges") return "Git changes";
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

async function writeClipboardText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall through to the selection-based clipboard path for older webviews.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Unable to copy to the clipboard");
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
