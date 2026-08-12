import type { DragEvent } from "react";
import {
  ExternalLink,
  GripVertical,
  LoaderCircle,
  MoreHorizontal,
  Play,
  Square,
  Star,
} from "lucide-react";
import { projectActivity } from "../lib/projectMeta";
import { useI18n } from "../lib/i18n";
import type { ProjectEndpoint, ProjectView } from "../types";
import { GitStatusBadge } from "./ProjectCard";
import { ProjectCodeSummary, ProjectTags } from "./ProjectCodeSummary";

interface Props {
  projects: ProjectView[];
  projectEndpoints: Record<string, ProjectEndpoint[]>;
  pendingIds: Set<string>;
  favoritePendingIds: Set<string>;
  canReorder: boolean;
  draggedId: string | null;
  dropTargetId: string | null;
  onToggle: (project: ProjectView) => void;
  onFavorite: (project: ProjectView) => void;
  onGit: (project: ProjectView) => void;
  onOpenEndpoint: (project: ProjectView, endpoint: ProjectEndpoint) => void;
  onOpenMenu: (project: ProjectView, position: { x: number; y: number }) => void;
  onDragStart: (event: DragEvent<HTMLElement>, projectId: string) => void;
  onDragOver: (event: DragEvent<HTMLElement>, projectId: string) => void;
  onDrop: (event: DragEvent<HTMLElement>, projectId: string) => void;
  onDragEnd: () => void;
}

export function ProjectTable({
  projects,
  projectEndpoints,
  pendingIds,
  favoritePendingIds,
  canReorder,
  draggedId,
  dropTargetId,
  onToggle,
  onFavorite,
  onGit,
  onOpenEndpoint,
  onOpenMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: Props) {
  const { t } = useI18n();
  return (
    <div className="project-table-shell">
      <table className="project-table">
        <thead>
          <tr>
            <th>{t("Project")}</th>
            <th>{t("Activity")}</th>
            <th>{t("Git")}</th>
            <th>{t("Code / command")}</th>
            <th aria-label={t("Project actions")} />
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => {
            const running = project.status === "running";
            const hasTasks = project.taskCount > 0;
            const pending = pendingIds.has(project.id);
            const primaryEndpoint = projectEndpoints[project.id]?.[0];
            return (
              <tr
                key={project.id}
                data-status={project.status}
                data-tag-color={project.finderTagColor ?? "none"}
                data-git-dirty={project.gitStatus?.dirty ?? false}
                data-crashed={project.crashedTaskCount > 0}
                data-draggable={canReorder}
                data-dragging={draggedId === project.id}
                data-drop-target={dropTargetId === project.id}
                draggable={canReorder}
                onDragStart={(event) => onDragStart(event, project.id)}
                onDragOver={(event) => onDragOver(event, project.id)}
                onDrop={(event) => onDrop(event, project.id)}
                onDragEnd={onDragEnd}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onOpenMenu(project, { x: event.clientX, y: event.clientY });
                }}
              >
                <td className="table-project-cell">
                  {canReorder ? (
                    <span className="table-drag-handle" title={t("Drag projects to reorder")}>
                      <GripVertical size={13} />
                    </span>
                  ) : null}
                  <span
                    className="finder-tag-dot"
                    title={projectAccentTitle(project, t)}
                  />
                  <strong title={project.name}>{project.name}</strong>
                  <button
                    className="favorite-button"
                    data-active={project.favorite}
                    onClick={() => onFavorite(project)}
                    disabled={favoritePendingIds.has(project.id)}
                    aria-label={project.favorite ? t("Unpin {{name}}", { name: project.name }) : t("Pin {{name}}", { name: project.name })}
                    title={project.favorite ? t("Unpin project") : t("Pin project")}
                  >
                    <Star size={13} fill={project.favorite ? "currentColor" : "none"} />
                  </button>
                </td>
                <td>
                  <span
                    className="table-activity"
                    data-running={running}
                    data-crashed={project.crashedTaskCount > 0}
                    title={activityTitle(project, t)}
                  >
                    {projectActivity(project, t)}
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
                  <div className="table-code-cell">
                    <div className="table-code-labels">
                      <ProjectTags tags={project.tags} compact />
                      <ProjectCodeSummary languages={project.languages} compact />
                    </div>
                    <div className="table-command" data-empty={!hasTasks} title={project.command || t("No automation configured")}>
                      {hasTasks ? <span>$</span> : null}
                      <code>{project.command || t("No automation")}</code>
                      {project.taskCount > 1 ? <em>{project.taskCount}</em> : null}
                    </div>
                  </div>
                </td>
                <td>
                  <div className="table-actions">
                    <button
                      className="run-button table-run-button"
                      data-running={running}
                      onClick={() => onToggle(project)}
                      disabled={pending || !hasTasks}
                      title={!hasTasks ? t("No automation tasks configured") : undefined}
                    >
                      {!hasTasks ? null : pending ? (
                        <LoaderCircle className="spin" size={12} />
                      ) : running ? (
                        <Square size={10} fill="currentColor" />
                      ) : (
                        <Play size={11} fill="currentColor" />
                      )}
                      {!hasTasks ? t("No tasks") : pending ? t("Working") : running ? t("Stop") : t("Run")}
                    </button>
                    {primaryEndpoint ? (
                      <button
                        className="icon-button table-endpoint-button"
                        onClick={() => onOpenEndpoint(project, primaryEndpoint)}
                        title={t("Open {{url}} · {{task}}", { url: primaryEndpoint.url, task: primaryEndpoint.taskName })}
                        aria-label={t("Open localhost port {{port}}", { port: primaryEndpoint.port })}
                      >
                        <ExternalLink size={13} />
                      </button>
                    ) : null}
                    <button
                      className="icon-button table-more-button"
                      onClick={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        onOpenMenu(project, { x: rect.right, y: rect.bottom + 5 });
                      }}
                      title={t("More actions")}
                      aria-label={t("More actions for {{name}}", { name: project.name })}
                    >
                      <MoreHorizontal size={14} />
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
