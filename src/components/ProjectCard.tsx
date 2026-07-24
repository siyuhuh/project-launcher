import {
  FileText,
  Folder,
  LoaderCircle,
  Pencil,
  Play,
  Square,
  TerminalSquare,
} from "lucide-react";
import type { ProjectView } from "../types";

interface Props {
  project: ProjectView;
  pending: boolean;
  onToggle: () => void;
  onLogs: () => void;
  onEdit: () => void;
  onOpenFolder: () => void;
  onOpenTerminal: () => void;
}

export function ProjectCard({
  project,
  pending,
  onToggle,
  onLogs,
  onEdit,
  onOpenFolder,
  onOpenTerminal,
}: Props) {
  const running = project.status === "running";
  return (
    <article className="project-card" data-status={project.status}>
      <div className="card-topline">
        <div className="project-identity">
          <span className="project-glyph">{project.name.slice(0, 1).toUpperCase()}</span>
          <div className="project-name-block">
            <h2>{project.name}</h2>
            <span className="status-label" data-status={project.status}>
              <i />
              {running ? `running · ${formatUptime(project.startedAt)}` : "stopped"}
            </span>
          </div>
        </div>
        <button className="icon-button" onClick={onEdit} aria-label={`Edit ${project.name}`}>
          <Pencil size={14} />
        </button>
      </div>
      <button className="path-button" onClick={onOpenFolder} title={project.path}>
        <Folder size={13} /><span>{compactPath(project.path)}</span>
      </button>
      <div className="command-line" title={project.command}>
        <span>$</span><code>{project.command}</code>
      </div>
      <div className="card-actions">
        <button className="run-button" data-running={running} onClick={onToggle} disabled={pending}>
          <ActionIcon pending={pending} running={running} />
          {actionLabel(pending, running)}
        </button>
        <div className="utility-actions">
          <button className="text-icon-button" onClick={onLogs} title="View logs">
            <FileText size={14} /> Logs
          </button>
          <button className="icon-button" onClick={onOpenTerminal} title="Open in Terminal">
            <TerminalSquare size={15} />
          </button>
        </div>
      </div>
    </article>
  );
}

function ActionIcon({ pending, running }: { pending: boolean; running: boolean }) {
  if (pending) return <LoaderCircle className="spin" size={14} />;
  if (running) return <Square size={12} fill="currentColor" />;
  return <Play size={13} fill="currentColor" />;
}

function actionLabel(pending: boolean, running: boolean): string {
  if (pending) return "Working";
  return running ? "Stop" : "Run";
}

function compactPath(path: string) {
  const homeMatch = path.match(/^\/Users\/[^/]+(\/.*)?$/);
  return homeMatch ? `~${homeMatch[1] ?? ""}` : path;
}

function formatUptime(startedAt: number | null) {
  if (!startedAt) return "now";
  const elapsed = Math.max(0, Math.floor(Date.now() / 1_000) - startedAt);
  if (elapsed < 60) return `${elapsed}s`;
  if (elapsed < 3_600) return `${Math.floor(elapsed / 60)}m`;
  return `${Math.floor(elapsed / 3_600)}h ${Math.floor((elapsed % 3_600) / 60)}m`;
}
