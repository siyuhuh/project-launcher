import { type FormEvent, useEffect, useState } from "react";
import {
  AlertTriangle,
  FolderX,
  Link2Off,
  LoaderCircle,
  Trash2,
  X,
} from "lucide-react";
import { useI18n } from "../lib/i18n";
import type { ProjectRemovalMode, ProjectView } from "../types";

interface Props {
  project: ProjectView;
  onClose: () => void;
  onConfirm: (mode: ProjectRemovalMode) => Promise<void>;
}

export function ProjectDeleteDialog({ project, onClose, onConfirm }: Props) {
  const { t } = useI18n();
  const [mode, setMode] = useState<ProjectRemovalMode>("unlink");
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const isRunning = project.status === "running";
  const requiresName = mode === "trash";
  const confirmed = !requiresName || confirmation === project.name;
  const canSubmit = !deleting && !isRunning && confirmed;

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!deleting) onClose();
    }
    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [deleting, onClose]);

  function chooseMode(nextMode: ProjectRemovalMode) {
    setMode(nextMode);
    setConfirmation("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setDeleting(true);
    try {
      await onConfirm(mode);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={() => {
        if (!deleting) onClose();
      }}
    >
      <section
        className="project-delete-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-delete-title"
        aria-describedby="project-delete-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">{t("PROJECT REMOVAL")}</p>
            <h2 id="project-delete-title">
              {t("Remove {{name}}?", { name: project.name })}
            </h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            disabled={deleting}
            aria-label={t("Close")}
          >
            <X size={16} />
          </button>
        </header>

        <form onSubmit={submit}>
          <p id="project-delete-description" className="project-delete-intro">
            {t("Choose whether to remove only the Runbox binding or also move the local folder to the system Trash.")}
          </p>

          <div className="project-delete-path">
            <FolderX size={14} aria-hidden="true" />
            <code>{project.path}</code>
          </div>

          <fieldset className="project-delete-options" disabled={deleting}>
            <legend>{t("Removal method")}</legend>
            <label data-selected={mode === "unlink"}>
              <input
                type="radio"
                name="project-removal-mode"
                value="unlink"
                checked={mode === "unlink"}
                onChange={() => chooseMode("unlink")}
                autoFocus
              />
              <span className="project-delete-option-icon">
                <Link2Off size={15} />
              </span>
              <span>
                <strong>{t("Remove from Runbox")}</strong>
                <small>
                  {t("Forget the project, tasks, and Runbox logs. The local folder and its files stay untouched.")}
                </small>
              </span>
            </label>
            <label data-selected={mode === "trash"} data-danger="true">
              <input
                type="radio"
                name="project-removal-mode"
                value="trash"
                checked={mode === "trash"}
                onChange={() => chooseMode("trash")}
              />
              <span className="project-delete-option-icon">
                <Trash2 size={15} />
              </span>
              <span>
                <strong>{t("Move local folder to Trash")}</strong>
                <small>
                  {t("Remove the Runbox binding and move the entire folder to the system Trash, where it can be restored.")}
                </small>
              </span>
            </label>
          </fieldset>

          {isRunning ? (
            <div className="project-delete-warning" role="alert">
              <AlertTriangle size={15} />
              <span>{t("Stop all project tasks before removing this project.")}</span>
            </div>
          ) : null}

          {mode === "trash" ? (
            <div className="project-delete-confirmation">
              {project.gitStatus?.dirty ? (
                <div className="project-delete-warning" role="alert">
                  <AlertTriangle size={15} />
                  <span>
                    {t(
                      "This Git repository has {{count}} changed files. They will move to Trash with the folder.",
                      { count: project.gitStatus.changed },
                    )}
                  </span>
                </div>
              ) : null}
              <label htmlFor="project-delete-confirmation">
                <span>
                  {t(
                    "Type {{name}} to confirm moving this folder and all of its contents to Trash.",
                    { name: project.name },
                  )}
                </span>
                <input
                  id="project-delete-confirmation"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                  placeholder={project.name}
                />
              </label>
            </div>
          ) : null}

          <footer className="project-delete-footer">
            <p>
              {mode === "trash"
                ? t("Runbox sends the folder to the system Trash instead of permanently erasing it.")
                : t("You can add the same folder again later.")}
            </p>
            <div>
              <button
                className="secondary-button"
                type="button"
                onClick={onClose}
                disabled={deleting}
              >
                {t("Cancel")}
              </button>
              <button
                className="delete-button project-delete-submit"
                type="submit"
                data-mode={mode}
                disabled={!canSubmit}
              >
                {deleting ? (
                  <LoaderCircle className="spin" size={14} />
                ) : mode === "trash" ? (
                  <Trash2 size={14} />
                ) : (
                  <Link2Off size={14} />
                )}
                {mode === "trash" ? t("Move folder to Trash") : t("Remove from Runbox")}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
}
