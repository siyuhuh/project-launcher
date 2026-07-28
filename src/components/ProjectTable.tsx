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
  Wrench,
} from "lucide-react";
import { projectActivity } from "../lib/projectMeta";
import type { ProjectView } from "../types";
import { GitStatusBadge } from "./ProjectCard";

interface Props {
  projects: ProjectView[];
  pendingIds: Set<string>;
  favoritePendingIds: Set<string>;
  canReorder: boolean;
  draggedId: string | null;
  dropTargetId: string | null;
  onToggle: (project: ProjectView) => void;
  onFavorite: (project: ProjectView) => void;
  onLogs: (project: ProjectView) => void;
  onEdit: (project: ProjectView) => void;
  onOpenFolder: (project: ProjectView) => void;
  onOpenTerminal: (project: ProjectView) => void;
  onGit: (project: ProjectView) => void;
  onTools: (project: ProjectView) => void;
  onDragStart: (event: DragEvent<HTMLElement>, projectId: string) => void;
  onDragOver: (event: DragEvent<HTMLElement>, projectId: string) => void;
  onDrop: (event: DragEvent<HTMLElement>, projectId: string) => void;
  onDragEnd: () => void;
}

export function ProjectTable({
  projects,
  pendingIds,
  favoritePendingIds,
  canReorder,
  draggedId,
  dropTargetId,
  onToggle,
  onFavorite,
  onLogs,
  onEdit,
  onOpenFolder,
  onOpenTerminal,
  onGit,
  onTools,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: Props) {
  return (
    <div className="project-table-shell">
      <table className="project-table">
        <thead>
          <tr>
            <th>Project</th>
            <th>Activity</th>
            <th>Git</th>
            <th>Command</th>
            <th aria-label="Project actions" />
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => {
            const running = project.status === "running";
            const pending = pendingIds.has(project.id);
            return (
              <tr
                key={project.id}
                data-status={project.status}
                data-tag-color={project.finderTagColor ?? "none"}
                data-draggable={canReorder}
                data-dragging={draggedId === project.id}
                data-drop-target={dropTargetId === project.id}
                draggable={canReorder}
                onDragStart={(event) => onDragStart(event, project.id)}
                onDragOver={(event) => onDragOver(event, project.id)}
                onDrop={(event) => onDrop(event, project.id)}
                onDragEnd={onDragEnd}
              >
                <td className="table-project-cell">
                  {canReorder ? (
                    <span className="table-drag-handle" title="Drag to reorder">
                      <GripVertical size={13} />
                    </span>
                  ) : null}
                  <span
                    className="finder-tag-dot"
                    title={
                      project.finderTagColor
                        ? `${project.finderTagColor} Finder tag`
                        : "No Finder tag"
                    }
                  />
                  <strong title={project.name}>{project.name}</strong>
                  <button
                    className="favorite-button"
                    data-active={project.favorite}
                    onClick={() => onFavorite(project)}
                    disabled={favoritePendingIds.has(project.id)}
                    aria-label={project.favorite ? `Unpin ${project.name}` : `Pin ${project.name}`}
                    title={project.favorite ? "Unpin project" : "Pin project"}
                  >
                    <Star size={13} fill={project.favorite ? "currentColor" : "none"} />
                  </button>
                </td>
                <td>
                  <span
                    className="table-activity"
                    data-running={running}
                    title={activityTitle(project)}
                  >
                    {projectActivity(project)}
                  </span>
                </td>
                <td>
                  <GitStatusBadge
                    status={project.gitStatus}
                    projectName={project.name}
                    onOpen={() => onGit(project)}
                  />
                </td>
                <td>
                  <div className="table-command" title={project.command}>
                    <span>$</span>
                    <code>{project.command}</code>
                  </div>
                </td>
                <td>
                  <div className="table-actions">
                    <button
                      className="run-button table-run-button"
                      data-running={running}
                      onClick={() => onToggle(project)}
                      disabled={pending}
                    >
                      {pending ? (
                        <LoaderCircle className="spin" size={12} />
                      ) : running ? (
                        <Square size={10} fill="currentColor" />
                      ) : (
                        <Play size={11} fill="currentColor" />
                      )}
                      {pending ? "Working" : running ? "Stop" : "Run"}
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => onTools(project)}
                      title="Developer tools"
                      aria-label={`Open developer tools for ${project.name}`}
                    >
                      <Wrench size={13} />
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => onOpenFolder(project)}
                      title={project.path}
                      aria-label="Show project folder"
                    >
                      <Folder size={13} />
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => onLogs(project)}
                      title="View logs"
                      aria-label="View logs"
                    >
                      <FileText size={13} />
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => onOpenTerminal(project)}
                      title="Open in Terminal"
                      aria-label="Open in Terminal"
                    >
                      <TerminalSquare size={13} />
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => onEdit(project)}
                      title="Edit project"
                      aria-label={`Edit ${project.name}`}
                    >
                      <Pencil size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function activityTitle(project: ProjectView): string {
  if (!project.startedAt) return "This project has not been started with Runbox yet";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(project.startedAt * 1_000);
}
