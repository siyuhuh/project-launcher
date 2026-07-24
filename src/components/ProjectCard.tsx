import type { DragEvent } from "react";
import {
  FileText,
  Folder,
  GripVertical,
  LoaderCircle,
  Pencil,
  Play,
  Square,
  Star,
  TerminalSquare,
} from "lucide-react";
import { projectActivity } from "../lib/projectMeta";
import type { ProjectView } from "../types";

interface Props {
  project: ProjectView;
  pending: boolean;
  favoritePending: boolean;
  canReorder: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onToggle: () => void;
  onFavorite: () => void;
  onLogs: () => void;
  onEdit: () => void;
  onOpenFolder: () => void;
  onOpenTerminal: () => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}

export function ProjectCard({
  project,
  pending,
  favoritePending,
  canReorder,
  dragging,
  dropTarget,
  onToggle,
  onFavorite,
  onLogs,
  onEdit,
  onOpenFolder,
  onOpenTerminal,
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
      data-draggable={canReorder}
      data-dragging={dragging}
      data-drop-target={dropTarget}
      draggable={canReorder}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
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
                title={
                  project.finderTagColor
                    ? `${project.finderTagColor} Finder tag`
                    : "No Finder tag"
                }
              />
              <h2 title={project.name}>{project.name}</h2>
            </div>
            <span className="activity-label" data-running={running} title={activityTitle(project)}>
              {projectActivity(project)}
            </span>
          </div>
        </div>
        <div className="card-icon-actions">
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
          <button className="icon-button" onClick={onEdit} aria-label={`Edit ${project.name}`}>
            <Pencil size={13} />
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
        </div>
        <div className="utility-actions">
          <button
            className="icon-button"
            onClick={onOpenFolder}
            title={project.path}
            aria-label="Show project folder"
          >
            <Folder size={14} />
          </button>
          <button className="icon-button" onClick={onLogs} title="View logs" aria-label="View logs">
            <FileText size={14} />
          </button>
          <button className="icon-button" onClick={onOpenTerminal} title="Open in Terminal" aria-label="Open in Terminal">
            <TerminalSquare size={14} />
          </button>
        </div>
      </div>
    </article>
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
