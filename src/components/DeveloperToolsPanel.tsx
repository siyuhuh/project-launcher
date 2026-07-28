import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Code2,
  ExternalLink,
  Folder,
  LoaderCircle,
  TerminalSquare,
  Wrench,
  X,
} from "lucide-react";
import { getDeveloperTools, openDeveloperTool } from "../lib/backend";
import type { DeveloperTool, ProjectView } from "../types";

interface Props {
  project: ProjectView;
  onClose: () => void;
  onNotify: (message: string, tone: "success" | "error") => void;
}

export function DeveloperToolsPanel({ project, onClose, onNotify }: Props) {
  const [tools, setTools] = useState<DeveloperTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyToolId, setBusyToolId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getDeveloperTools(project.id)
      .then((items) => {
        if (!cancelled) setTools(items);
      })
      .catch((error) => {
        if (!cancelled) onNotify(errorMessage(error), "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onNotify, project.id]);

  const editors = tools.filter((tool) => tool.kind === "editor");
  const shortcuts = tools.filter((tool) => tool.kind !== "editor");

  async function handleOpen(tool: DeveloperTool) {
    if (busyToolId) return;
    setBusyToolId(tool.id);
    try {
      await openDeveloperTool(project.id, tool.id);
      onNotify(`Opened ${project.name} in ${tool.name}`, "success");
    } catch (error) {
      onNotify(errorMessage(error), "error");
    } finally {
      setBusyToolId(null);
    }
  }

  return (
    <div
      className="tools-panel-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        className="tools-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Developer tools for ${project.name}`}
      >
        <header className="tools-panel-header">
          <div>
            <div className="tools-panel-kicker">
              <Wrench size={12} /> DEVELOPER TOOLS
            </div>
            <h2>{project.name}</h2>
            <p title={project.path}>{project.path}</p>
          </div>
          <button
            className="panel-close-button"
            onClick={onClose}
            aria-label="Close developer tools"
          >
            <X size={16} />
          </button>
        </header>

        {loading ? (
          <div className="tools-loading-state">
            <LoaderCircle className="spin" size={16} /> Detecting local tools
          </div>
        ) : (
          <div className="tools-panel-body">
            <ToolSection
              title="Open in editor"
              detail="Detected on this Mac"
              tools={editors}
              empty="No supported editor was detected. Runbox checks Cursor, VS Code, Zed, Nova, Sublime Text, and JetBrains IDEs."
              busyToolId={busyToolId}
              onOpen={(tool) => void handleOpen(tool)}
            />
            <ToolSection
              title="Project shortcuts"
              detail="System and repository"
              tools={shortcuts}
              busyToolId={busyToolId}
              onOpen={(tool) => void handleOpen(tool)}
            />
          </div>
        )}
      </section>
    </div>
  );
}

function ToolSection({
  title,
  detail,
  tools,
  empty,
  busyToolId,
  onOpen,
}: {
  title: string;
  detail: string;
  tools: DeveloperTool[];
  empty?: string;
  busyToolId: string | null;
  onOpen: (tool: DeveloperTool) => void;
}) {
  return (
    <section className="tools-section">
      <header>
        <div>
          <h3>{title}</h3>
          <span>{detail}</span>
        </div>
        <strong>{tools.length}</strong>
      </header>
      {tools.length > 0 ? (
        <div className="tools-grid">
          {tools.map((tool) => (
            <button
              className="tool-card"
              key={tool.id}
              onClick={() => onOpen(tool)}
              disabled={Boolean(busyToolId)}
            >
              <span className="tool-card-icon">{toolIcon(tool)}</span>
              <span className="tool-card-copy">
                <strong>{tool.name}</strong>
                <small>{tool.detail}</small>
              </span>
              {busyToolId === tool.id ? (
                <LoaderCircle className="spin" size={14} />
              ) : (
                <ArrowUpRight size={14} />
              )}
            </button>
          ))}
        </div>
      ) : empty ? (
        <p className="tools-empty-state">{empty}</p>
      ) : null}
    </section>
  );
}

function toolIcon(tool: DeveloperTool) {
  if (tool.kind === "editor") return <Code2 size={17} />;
  if (tool.kind === "terminal") return <TerminalSquare size={17} />;
  if (tool.kind === "folder") return <Folder size={17} />;
  return <ExternalLink size={17} />;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
