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
import type { GitStatus, ProjectEndpoint, ProjectView } from "../types";

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
  const running = project.status === "running";

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
            <span className="drag-handle" title="Drag to reorder">
              <GripVertical size={14} />
            </span>
          ) : null}
          <div className="project-title-block">
            <div className="project-title-row">
              <span
                className="finder-tag-dot"
                title={projectAccentTitle(project)}
              />
              <h2 title={project.name}>{project.name}</h2>
            </div>
            <div className="project-meta-row">
              <span
                className="activity-label"
                data-running={running}
                data-crashed={project.crashedTaskCount > 0}
                title={activityTitle(project)}
              >
                {projectActivity(project)}
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
            aria-label={`More actions for ${project.name}`}
            title="More actions"
          >
            <MoreHorizontal size={14} />
          </button>
          <button
            className="favorite-button"
            data-active={project.favorite}
            onClick={onFavorite}
            disabled={favoritePending}
            aria-label={project.favorite ? `Unpin ${project.name}` : `Pin ${project.name}`}
            title={project.favorite ? "Unpin project" : "Pin project"}
          >
            <Star size={14} fill={project.favorite ? "currentColor" : "none"} />
          </button>
        </div>
      </div>

      <div className="card-actions">
        <button className="run-button" data-running={running} onClick={onToggle} disabled={pending}>
          <ActionIcon pending={pending} running={running} />
          {actionLabel(pending, running)}
        </button>
        <div className="command-line" title={project.command}>
          <span>$</span><code>{project.command}</code>
          {project.taskCount > 1 ? <em>{project.taskCount} tasks</em> : null}
        </div>
      </div>

      <div className="card-footer">
        {endpoints.length > 0 ? (
          <div className="project-endpoints" aria-label="Local development addresses">
            <button
              className="project-endpoint-button"
              onClick={() => onOpenEndpoint(endpoints[0])}
              title={`Open ${endpoints[0].url} · ${endpoints[0].taskName}`}
            >
              <Globe2 size={12} />
              <span>localhost:{endpoints[0].port}</span>
              <ExternalLink size={11} />
            </button>
            {endpoints.length > 1 ? (
              <button
                className="project-endpoint-more"
                onClick={onLogs}
                title={`Show all ${endpoints.length} listening addresses`}
                aria-label={`Show all ${endpoints.length} listening addresses`}
              >
                +{endpoints.length - 1}
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="card-quick-actions" aria-label="Project shortcuts">
          <button
            className="icon-button card-quick-action"
            onClick={onLogs}
            title="Tasks and health"
            aria-label={`Open tasks and health for ${project.name}`}
          >
            <Activity size={13} />
          </button>
          <button
            className="icon-button card-quick-action"
            onClick={onOpenFolder}
            title="Reveal in Finder"
            aria-label={`Reveal ${project.name} in Finder`}
          >
            <FolderOpen size={13} />
          </button>
          <button
            className="icon-button card-quick-action"
            onClick={onOpenTerminal}
            title="Open in Terminal"
            aria-label={`Open ${project.name} in Terminal`}
          >
            <TerminalSquare size={13} />
          </button>
          <button
            className="icon-button card-quick-action"
            onClick={onEdit}
            title="Edit project"
            aria-label={`Edit ${project.name}`}
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
  const Wrapper = onOpen && status?.isRepo !== false ? "button" : "span";

  if (!status) {
    return (
      <span
        className="git-status"
        data-state="checking"
        title="Reading the current Git branch and changed files"
      >
        <LoaderCircle className="spin" size={10} />
        <span>Checking Git</span>
      </span>
    );
  }
  if (!status.isRepo) {
    return (
      <span className="git-status" data-state="none" title="This folder is not a Git repository">
        <GitBranch size={11} /> no git
      </span>
    );
  }

  const sync = [
    status.ahead > 0 ? `↑${status.ahead}` : "",
    status.behind > 0 ? `↓${status.behind}` : "",
  ].filter(Boolean).join(" ");
  const detail = status.dirty ? `${status.changed} changed` : "clean";
  const label = sync ? `${detail} ${sync}` : detail;
  return (
    <Wrapper
      className="git-status"
      data-state={status.dirty ? "dirty" : "clean"}
      title={`${status.branch} · ${label}`}
      onClick={onOpen}
      aria-label={onOpen ? `Open Git workspace for ${projectName ?? "project"}` : undefined}
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

function actionLabel(pending: boolean, running: boolean): string {
  if (pending) return "Working";
  return running ? "Stop" : "Run";
}

function activityTitle(project: ProjectView): string {
  if (!project.startedAt) return "This project has not been started with Runbox yet";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(project.startedAt * 1_000);
}

function projectAccentTitle(project: ProjectView): string {
  if (project.finderTagColor) return `${project.finderTagColor} Finder tag`;
  if (project.crashedTaskCount > 0) return "A project task crashed";
  if (project.status === "running") return "Project is running";
  if (project.gitStatus?.dirty) return "Project has uncommitted changes";
  return "No Finder tag";
}
