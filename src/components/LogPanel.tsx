import { useEffect, useRef } from "react";
import { Eraser, X } from "lucide-react";
import type { ProjectView } from "../types";

interface Props {
  project: ProjectView;
  contents: string;
  onClose: () => void;
  onClear: () => void;
}

export function LogPanel({ project, contents, onClose, onClear }: Props) {
  const outputRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const output = outputRef.current;
    if (output) output.scrollTop = output.scrollHeight;
  }, [contents]);

  return (
    <section className="log-panel" aria-label={`${project.name} logs`}>
      <header className="log-header">
        <div>
          <span className="log-status" data-status={project.status} />
          <strong>{project.name}</strong><span>/ output</span>
        </div>
        <div>
          <button className="text-icon-button" onClick={onClear}><Eraser size={13} /> Clear</button>
          <button className="icon-button" onClick={onClose} aria-label="Close logs"><X size={15} /></button>
        </div>
      </header>
      <pre ref={outputRef}>
        {contents || <span className="log-empty">No output yet. Run the project to start collecting logs.</span>}
      </pre>
    </section>
  );
}
