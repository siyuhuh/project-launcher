import { type FormEvent, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, LoaderCircle, Trash2, X } from "lucide-react";
import { detectProject } from "../lib/backend";
import type { ProjectForm } from "../types";

interface Props {
  project: ProjectForm;
  onClose: () => void;
  onSave: (project: ProjectForm) => Promise<void>;
  onDelete?: (project: ProjectForm) => Promise<void>;
}

export function ProjectModal({ project, onClose, onSave, onDelete }: Props) {
  const [form, setForm] = useState(project);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editing = Boolean(project.id);

  async function chooseFolder() {
    const path = await open({ directory: true, multiple: false });
    if (!path) return;
    try {
      const detected = await detectProject(path);
      setForm((current) => ({ ...current, ...detected }));
    } catch {
      setForm((current) => ({ ...current, path }));
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!onDelete) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await onDelete(form);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="project-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">{editing ? "EDIT ENTRY" : "NEW ENTRY"}</p>
            <h2 id="project-modal-title">{editing ? "Project settings" : "Add a project"}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <form onSubmit={submit}>
          <label className="field-label" htmlFor="project-name">
            Name
            <input
              id="project-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="my-web"
              autoFocus
              required
            />
          </label>
          <label className="field-label" htmlFor="project-path">
            Project directory
            <span className="path-input">
              <input
                id="project-path"
                value={form.path}
                onChange={(event) => setForm({ ...form, path: event.target.value })}
                placeholder="~/Projects/my-web"
                required
              />
              <button type="button" onClick={() => void chooseFolder()}>
                <FolderOpen size={14} /> Browse
              </button>
            </span>
          </label>
          <label className="field-label" htmlFor="project-command">
            Start command
            <span className="command-input">
              <span>$</span>
              <input
                id="project-command"
                value={form.command}
                onChange={(event) => setForm({ ...form, command: event.target.value })}
                placeholder="pnpm run dev"
                required
              />
            </span>
          </label>
          <p className="form-hint">
            Commands run inside your project folder using your login shell, so pnpm, NVM and other
            Terminal tools remain available.
          </p>
          <footer className="modal-footer">
            {onDelete ? (
              <button
                className="delete-button"
                type="button"
                data-confirm={confirmDelete}
                onClick={() => void remove()}
                disabled={deleting}
              >
                {deleting ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />}
                {confirmDelete ? "Click again to remove" : "Remove"}
              </button>
            ) : <span />}
            <div>
              <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
              <button className="primary-button" type="submit" disabled={saving}>
                {saving ? <LoaderCircle className="spin" size={14} /> : null}
                {submitLabel(saving, editing)}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
}

function submitLabel(saving: boolean, editing: boolean): string {
  if (saving) return "Saving";
  return editing ? "Save changes" : "Add project";
}
