import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Command,
  FolderOpen,
  LayoutGrid,
  Plus,
  Search,
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
  saveProject,
  startProject,
  stopProject,
} from "./lib/backend";
import type { Project, ProjectForm, ProjectView } from "./types";
import "./App.css";

type Filter = "all" | "running";
type Toast = { id: number; message: string; tone: "success" | "error" };

const EMPTY_FORM: ProjectForm = {
  id: "",
  name: "",
  path: "",
  command: "",
  favorite: false,
};

export default function App() {
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [modalProject, setModalProject] = useState<ProjectForm | null>(null);
  const [logProjectId, setLogProjectId] = useState<string | null>(null);
  const [logContents, setLogContents] = useState("");
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

  const visibleProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return projects.filter((project) => {
      if (filter === "running" && project.status !== "running") return false;
      if (!normalizedQuery) return true;
      return [project.name, project.path, project.command].some((value) =>
        value.toLowerCase().includes(normalizedQuery),
      );
    });
  }, [filter, projects, query]);

  const logProject = projects.find((project) => project.id === logProjectId) ?? null;

  async function withPending(projectId: string, action: () => Promise<unknown>) {
    setPendingIds((current) => new Set(current).add(projectId));
    try {
      await action();
      await refreshProjects();
    } catch (error) {
      showToast(errorMessage(error), "error");
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(projectId);
        return next;
      });
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

  return (
    <div className="app-shell">
      <div className="window-drag-region" data-tauri-drag-region />
      <aside className="sidebar">
        <div className="brand" aria-label="Runbox">
          <span className="brand-mark"><Terminal size={17} strokeWidth={2.2} /></span>
          <span>runbox<span className="brand-cursor">_</span></span>
        </div>
        <nav className="nav-list" aria-label="Project filters">
          <button className="nav-item" data-active={filter === "all"} onClick={() => setFilter("all")}>
            <LayoutGrid size={15} /><span>All projects</span>
            <span className="nav-count">{projects.length}</span>
          </button>
          <button className="nav-item" data-active={filter === "running"} onClick={() => setFilter("running")}>
            <Activity size={15} /><span>Running</span>
            <span className="nav-count running-count">{runningCount}</span>
          </button>
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
            <h1>{filter === "running" ? "Running" : "Projects"}</h1>
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

        <section className="project-summary" aria-label="Project summary">
          <span><strong>{visibleProjects.length}</strong>{visibleProjects.length === 1 ? " project" : " projects"}</span>
          <span className="summary-separator">/</span>
          <span className={runningCount > 0 ? "summary-running" : ""}><i />{runningCount} running</span>
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
                  onToggle={() => void handleToggle(project)}
                  onLogs={() => setLogProjectId(project.id)}
                  onEdit={() => setModalProject(project)}
                  onOpenFolder={() => void openProjectFolder(project.id).catch((error) => showToast(errorMessage(error), "error"))}
                  onOpenTerminal={() => void openProjectTerminal(project.id).catch((error) => showToast(errorMessage(error), "error"))}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              filtered={projects.length > 0}
              onAdd={() => setModalProject(EMPTY_FORM)}
              onClear={() => { setQuery(""); setFilter("all"); }}
            />
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

function EmptyState({ filtered, onAdd, onClear }: { filtered: boolean; onAdd: () => void; onClear: () => void }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Command size={21} /></div>
      <h2>{filtered ? "No matching projects" : "Your commands, one click away."}</h2>
      <p>{filtered ? "Try another search or show all projects." : "Add a project folder. Runbox will detect the usual dev command for you."}</p>
      <button className="secondary-button" onClick={filtered ? onClear : onAdd}>
        {filtered ? "Clear filters" : <><FolderOpen size={15} /> Choose a folder</>}
      </button>
    </div>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
