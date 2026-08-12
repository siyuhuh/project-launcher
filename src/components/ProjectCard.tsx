import type { DragEvent } from "react";
import {
  Activity,
  ExternalLink,
  FolderOpen,
  GitBranch,
  Globe2,
  GripVertical,
  LoaderCircle,
  MoreHorizontal,
  Play,
  Settings2,
  Square,
  Star,
  TerminalSquare,
} from "lucide-react";
import { projectActivity } from "../lib/projectMeta";
import { useI18n } from "../lib/i18n";
import type { GitStatus, ProjectEndpoint, ProjectView } from "../types";
import { ProjectCodeSummary, ProjectTags } from "./ProjectCodeSummary";

interface Props {
  project: ProjectView;
  endpoints: ProjectEndpoint[];
  pending: boolean;
  favoritePending: boolean;
  canReorder: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onToggle: () => void;
  onFavorite: () => void;
  onLogs: () => void;
  onGit: () => void;
  onEdit: () => void;
  onOpenFolder: () => void;
  onOpenTerminal: () => void;
  onOpenEndpoint: (endpoint: ProjectEndpoint) => void;
  onOpenMenu: (position: { x: number; y: number }) => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}

export function ProjectCard({
  project,
  endpoints,
  pending,
  favoritePending,
  canReorder,
  dragging,
  dropTarget,
  onToggle,
  onFavorite,
  onLogs,
  onGit,
  onEdit,
  onOpenFolder,
  onOpenTerminal,
  onOpenEndpoint,
  onOpenMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: Props) {
  const { t } = useI18n();
  const running = project.status === "running";
  const hasTasks = project.taskCount > 0;

  return (
    <article
      className="project-card"
      data-status={project.status}
      data-tag-color={project.finderTagColor ?? "none"}
      data-git-dirty={project.gitStatus?.dirty ?? false}
      data-crashed={project.crashedTaskCount > 0}
      data-draggable={canReorder}
      data-dragging={dragging}
      data-drop-target={dropTarget}
      draggable={canReorder}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onContextMenu={(event) => {
        event.preventDefault();
        onOpenMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      <div className="card-topline">
        <div className="project-heading">
          {canReorder ? (
            <span className="drag-handle" title={t("Drag projects to reorder")}>
              <GripVertical size={14} />
            </span>
          ) : null}
          <div className="project-title-block">
            <div className="project-title-row">
              <span
                className="finder-tag-dot"
                title={projectAccentTitle(project, t)}
              />
              <h2 title={project.name}>{project.name}</h2>
            </div>
            <div className="project-meta-row">
              <span
                className="activity-label"
                data-running={running}
                data-crashed={project.crashedTaskCount > 0}
                title={activityTitle(project, t)}
              >
                {projectActivity(project, t)}
              </span>
              <GitStatusBadge
                status={project.gitStatus}
                projectName={project.name}
                onOpen={onGit}
              />
            </div>
          </div>
        </div>
        <div className="card-icon-actions">
          <button
            className="icon-button project-more-button"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              onOpenMenu({ x: rect.right, y: rect.bottom + 5 });
            }}
            aria-label={t("More actions for {{name}}", { name: project.name })}
            title={t("More actions")}
          >
            <MoreHorizontal size={14} />
          </button>
          <button
            className="favorite-button"
            data-active={project.favorite}
            onClick={onFavorite}
            disabled={favoritePending}
            aria-label={project.favorite ? t("Unpin {{name}}", { name: project.name }) : t("Pin {{name}}", { name: project.name })}
            title={project.favorite ? t("Unpin project") : t("Pin project")}
          >
            <Star size={14} fill={project.favorite ? "currentColor" : "none"} />
          </button>
        </div>
      </div>

      <div className="card-actions">
        <button
          className="run-button"
          data-running={running}
          data-empty={!hasTasks}
          onClick={onToggle}
          disabled={pending || !hasTasks}
          title={!hasTasks ? t("No automation tasks configured") : undefined}
        >
          {hasTasks ? <ActionIcon pending={pending} running={running} /> : null}
          {hasTasks ? actionLabel(pending, running, t) : t("No tasks")}
        </button>
        <div className="command-line" data-empty={!hasTasks} title={project.command || t("No automation configured")}>
          {hasTasks ? <span>$</span> : null}<code>{project.command || t("No automation")}</code>
          {project.taskCount > 1 ? <em>{t("{{count}} tasks", { count: project.taskCount })}</em> : null}
        </div>
      </div>

      {project.tags.length > 0 || project.languages.length > 0 ? (
        <div className="project-classification">
          <ProjectTags tags={project.tags} />
          <ProjectCodeSummary languages={project.languages} />
        </div>
      ) : null}

      <div className="card-footer">
        {endpoints.length > 0 ? (
          <div className="project-endpoints" aria-label={t("Local development addresses")}>
            <button
              className="project-endpoint-button"
              onClick={() => onOpenEndpoint(endpoints[0])}
              title={t("Open {{url}} · {{task}}", { url: endpoints[0].url, task: endpoints[0].taskName })}
            >
              <Globe2 size={12} />
              <span>localhost:{endpoints[0].port}</span>
              <ExternalLink size={11} />
            </button>
            {endpoints.length > 1 ? (
              <button
                className="project-endpoint-more"
                onClick={onLogs}
                title={t("Show all {{count}} listening addresses", { count: endpoints.length })}
                aria-label={t("Show all {{count}} listening addresses", { count: endpoints.length })}
              >
                +{endpoints.length - 1}
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="card-quick-actions" aria-label={t("Project shortcuts")}>
          <button
            className="icon-button card-quick-action"
            onClick={onLogs}
            disabled={!hasTasks}
            title={t("Tasks and health")}
            aria-label={t("Open tasks and health for {{name}}", { name: project.name })}
          >
            <Activity size={13} />
          </button>
          <button
            className="icon-button card-quick-action"
            onClick={onOpenFolder}
            title={t("Reveal in Finder")}
            aria-label={t("Reveal {{name}} in Finder", { name: project.name })}
          >
            <FolderOpen size={13} />
          </button>
          <button
            className="icon-button card-quick-action"
            onClick={onOpenTerminal}
            title={t("Open in Terminal")}
            aria-label={t("Open {{name}} in Terminal", { name: project.name })}
          >
            <TerminalSquare size={13} />
          </button>
          <button
            className="icon-button card-quick-action"
            onClick={onEdit}
            title={t("Edit project")}
            aria-label={t("Edit {{name}}", { name: project.name })}
          >
            <Settings2 size={13} />
          </button>
        </div>
      </div>
    </article>
  );
}

export function GitStatusBadge({
  status,
  projectName,
  onOpen,
}: {
  status: GitStatus | null;
  projectName?: string;
  onOpen?: () => void;
}) {
  const { t } = useI18n();
  const Wrapper = onOpen && status?.isRepo !== false ? "button" : "span";

  if (!status) {
    return (
      <span
        className="git-status"
        data-state="checking"
        title={t("Reading the current Git branch and changed files")}
      >
        <LoaderCircle className="spin" size={10} />
        <span>{t("Checking Git")}</span>
      </span>
    );
  }
  if (!status.isRepo) {
    return (
      <span className="git-status" data-state="none" title={t("This folder is not a Git repository")}>
        <GitBranch size={11} /> {t("no git")}
      </span>
    );
  }

  const sync = [
    status.ahead > 0 ? `↑${status.ahead}` : "",
    status.behind > 0 ? `↓${status.behind}` : "",
  ].filter(Boolean).join(" ");
  const detail = status.dirty ? `${status.changed} ${t("changed")}` : t("clean");
  const label = sync ? `${detail} ${sync}` : detail;
  return (
    <Wrapper
      className="git-status"
      data-state={status.dirty ? "dirty" : "clean"}
      title={`${status.branch} · ${label}`}
      onClick={onOpen}
      aria-label={onOpen ? t("Open Git workspace for {{name}}", { name: projectName ?? t("project") }) : undefined}
    >
      <GitBranch size={11} />
      <strong>{status.branch}</strong>
      <span>{label}</span>
    </Wrapper>
  );
}

function ActionIcon({ pending, running }: { pending: boolean; running: boolean }) {
  if (pending) return <LoaderCircle className="spin" size={13} />;
  if (running) return <Square size={11} fill="currentColor" />;
  return <Play size={12} fill="currentColor" />;
}

function actionLabel(pending: boolean, running: boolean, t: (key: string) => string): string {
  if (pending) return t("Working");
  return running ? t("Stop") : t("Run");
}

function activityTitle(project: ProjectView, t: (key: string) => string): string {
  if (project.taskCount === 0) return t("No automation tasks configured");
  if (!project.startedAt) return t("This project has not been started with Runbox yet");
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(project.startedAt * 1_000);
}

function projectAccentTitle(project: ProjectView, t: (key: string, values?: Record<string, string | number>) => string): string {
  if (project.finderTagColor) return t("{{color}} Finder tag", { color: project.finderTagColor });
  if (project.crashedTaskCount > 0) return t("A project task crashed");
  if (project.status === "running") return t("Project is running");
  if (project.gitStatus?.dirty) return t("Project has uncommitted changes");
  return t("No Finder tag");
}
