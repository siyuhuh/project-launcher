import { useEffect, useRef } from "react";
import { Eraser, X } from "lucide-react";
import { useI18n } from "../lib/i18n";
import type { ProjectView } from "../types";

interface Props {
  project: ProjectView;
  contents: string;
  onClose: () => void;
  onClear: () => void;
}

export function LogPanel({ project, contents, onClose, onClear }: Props) {
  const { t } = useI18n();
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
          <strong>{project.name}</strong><span>/ {t("output")}</span>
        </div>
        <div>
          <button className="text-icon-button" onClick={onClear}><Eraser size={13} /> {t("Clear")}</button>
          <button className="icon-button" onClick={onClose} aria-label={t("Close logs")}><X size={15} /></button>
        </div>
      </header>
      <pre ref={outputRef}>
        {contents || <span className="log-empty">{t("No output yet. Run the project to start collecting logs.")}</span>}
      </pre>
    </section>
  );
}
