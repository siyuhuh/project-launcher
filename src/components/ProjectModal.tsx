import { type FormEvent, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  FolderOpen,
  GitMerge,
  GripVertical,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { detectProject } from "../lib/backend";
import type { ProjectForm, ProjectTask } from "../types";

interface Props {
  project: ProjectForm;
  onClose: () => void;
  onSave: (project: ProjectForm) => Promise<void>;
  onDelete?: (project: ProjectForm) => Promise<void>;
}

export function ProjectModal({ project, onClose, onSave, onDelete }: Props) {
  const [form, setForm] = useState(() => withProjectTasks(project));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [detectingTasks, setDetectingTasks] = useState(false);
  const [taskDetectionError, setTaskDetectionError] = useState<string | null>(null);
  const editing = Boolean(project.id);

  async function chooseFolder() {
    const path = await open({ directory: true, multiple: false });
    if (!path) return;
    try {
      const detected = await detectProject(path);
      setForm((current) => ({ ...current, ...detected }));
      setTaskDetectionError(null);
    } catch {
      setForm((current) => ({ ...current, path }));
    }
  }

  async function detectTasks() {
    if (!form.path.trim()) return;
    setDetectingTasks(true);
    setTaskDetectionError(null);
    try {
      const detected = await detectProject(form.path);
      setForm((current) => ({
        ...current,
        command: detected.command,
        tasks: detected.tasks,
      }));
    } catch (error) {
      setTaskDetectionError(errorMessage(error));
    } finally {
      setDetectingTasks(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave({ ...form, command: form.tasks[0]?.command ?? "" });
    } finally {
      setSaving(false);
    }
  }

  function updateTask(index: number, patch: Partial<ProjectTask>) {
    setForm((current) => {
      const tasks = current.tasks.map((task, taskIndex) =>
        taskIndex === index ? { ...task, ...patch } : task,
      );
      return {
        ...current,
        tasks,
        command: tasks[0]?.command ?? "",
      };
    });
  }

  function addTask() {
    setForm((current) => ({
      ...current,
      tasks: [
        ...current.tasks,
        {
          id: crypto.randomUUID(),
          name: `Task ${current.tasks.length + 1}`,
          command: "",
          autoStart: false,
          dependsOn: [],
          readiness: { kind: "process", value: "", timeoutSeconds: 30 },
        },
      ],
    }));
  }

  function removeTask(index: number) {
    setForm((current) => {
      if (current.tasks.length === 1) return current;
      const removedTaskId = current.tasks[index]?.id;
      const tasks = current.tasks.filter((_, taskIndex) => taskIndex !== index);
      return {
        ...current,
        tasks: tasks.map((task) => ({
          ...task,
          dependsOn: task.dependsOn.filter((dependency) => dependency !== removedTaskId),
        })),
        command: tasks[0]?.command ?? "",
      };
    });
  }

  function toggleDependency(index: number, dependencyId: string) {
    const task = form.tasks[index];
    const selected = task.dependsOn.includes(dependencyId);
    updateTask(index, {
      dependsOn: selected
        ? task.dependsOn.filter((id) => id !== dependencyId)
        : [...task.dependsOn, dependencyId],
    });
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
          <section className="project-task-editor">
            <header>
              <div>
                <strong>Project tasks</strong>
                <span>Choose which long-running tasks start with the project.</span>
              </div>
              <div className="project-task-editor-actions">
                <button
                  type="button"
                  onClick={() => void detectTasks()}
                  disabled={detectingTasks || !form.path.trim()}
                >
                  <RefreshCw className={detectingTasks ? "spin" : undefined} size={12} />
                  Import scripts
                </button>
                <button type="button" onClick={addTask}>
                  <Plus size={13} /> Add task
                </button>
              </div>
            </header>
            {taskDetectionError ? (
              <p className="project-task-detection-error">{taskDetectionError}</p>
            ) : null}
            <div className="project-task-edit-list">
              {form.tasks.map((task, index) => (
                <article className="project-task-edit-row" key={task.id}>
                  <GripVertical size={13} aria-hidden="true" />
                  <div className="project-task-edit-fields">
                    <div>
                      <label>
                        <span>{index === 0 ? "Primary task" : "Task name"}</span>
                        <input
                          value={task.name}
                          onChange={(event) => updateTask(index, { name: event.target.value })}
                          placeholder={index === 0 ? "Dev" : "Worker"}
                          required
                        />
                      </label>
                      <label className="task-autostart-toggle">
                        <input
                          type="checkbox"
                          checked={task.autoStart}
                          onChange={(event) =>
                            updateTask(index, { autoStart: event.target.checked })
                          }
                        />
                        <span>Run with project</span>
                      </label>
                    </div>
                    <label>
                      <span>Command</span>
                      <span className="command-input">
                        <span>$</span>
                        <input
                          value={task.command}
                          onChange={(event) => updateTask(index, { command: event.target.value })}
                          placeholder="pnpm run dev"
                          required
                        />
                      </span>
                    </label>
                    <details className="task-reliability-settings">
                      <summary>
                        <ShieldCheck size={12} />
                        <span>Reliability</span>
                        <small>{readinessSummary(task)}</small>
                      </summary>
                      <div className="task-reliability-grid">
                        <label>
                          <span>Ready when</span>
                          <select
                            value={task.readiness.kind}
                            onChange={(event) =>
                              updateTask(index, {
                                readiness: {
                                  ...task.readiness,
                                  kind: event.target.value as ProjectTask["readiness"]["kind"],
                                  value: "",
                                },
                              })
                            }
                          >
                            <option value="process">Process stays running</option>
                            <option value="port">Port is listening</option>
                            <option value="http">HTTP endpoint responds</option>
                            <option value="log">Log contains text</option>
                          </select>
                        </label>
                        {task.readiness.kind !== "process" ? (
                          <label className="task-readiness-value">
                            <span>{readinessValueLabel(task.readiness.kind)}</span>
                            <input
                              type={task.readiness.kind === "port" ? "number" : "text"}
                              min={task.readiness.kind === "port" ? 1 : undefined}
                              max={task.readiness.kind === "port" ? 65535 : undefined}
                              value={task.readiness.value}
                              onChange={(event) =>
                                updateTask(index, {
                                  readiness: { ...task.readiness, value: event.target.value },
                                })
                              }
                              placeholder={readinessPlaceholder(task.readiness.kind)}
                              required
                            />
                          </label>
                        ) : null}
                        <label className="task-readiness-timeout">
                          <span>Timeout</span>
                          <span className="task-timeout-input">
                            <input
                              type="number"
                              min={1}
                              max={300}
                              value={task.readiness.timeoutSeconds}
                              onChange={(event) =>
                                updateTask(index, {
                                  readiness: {
                                    ...task.readiness,
                                    timeoutSeconds: Number(event.target.value),
                                  },
                                })
                              }
                              required
                            />
                            <small>sec</small>
                          </span>
                        </label>
                      </div>
                      {form.tasks.length > 1 ? (
                        <div className="task-dependency-picker">
                          <span><GitMerge size={11} /> Starts after</span>
                          <div>
                            {form.tasks.map((candidate, candidateIndex) =>
                              candidateIndex === index ? null : (
                                <button
                                  key={candidate.id}
                                  type="button"
                                  data-active={task.dependsOn.includes(candidate.id)}
                                  onClick={() => toggleDependency(index, candidate.id)}
                                >
                                  {candidate.name || `Task ${candidateIndex + 1}`}
                                </button>
                              ),
                            )}
                          </div>
                        </div>
                      ) : null}
                    </details>
                  </div>
                  <button
                    className="task-remove-button"
                    type="button"
                    onClick={() => removeTask(index)}
                    disabled={form.tasks.length === 1}
                    aria-label={`Remove ${task.name || "task"}`}
                  >
                    <X size={13} />
                  </button>
                </article>
              ))}
            </div>
          </section>
          <p className="form-hint">
            Commands use your login shell, so pnpm, NVM and other Terminal tools remain available.
            The first task remains compatible with the existing `p project` command.
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

function readinessSummary(task: ProjectTask): string {
  switch (task.readiness.kind) {
    case "port":
      return task.readiness.value ? `Port ${task.readiness.value}` : "Port check";
    case "http":
      return task.readiness.value || "HTTP check";
    case "log":
      return task.readiness.value ? `Log: ${task.readiness.value}` : "Log check";
    default:
      return "Process check";
  }
}

function readinessValueLabel(kind: ProjectTask["readiness"]["kind"]): string {
  if (kind === "port") return "Port";
  if (kind === "http") return "HTTP URL";
  return "Log phrase";
}

function readinessPlaceholder(kind: ProjectTask["readiness"]["kind"]): string {
  if (kind === "port") return "3000";
  if (kind === "http") return "http://localhost:3000/health";
  return "ready in";
}

function withProjectTasks(project: ProjectForm): ProjectForm {
  if (project.tasks.length > 0) return project;
  return {
    ...project,
    tasks: [
      {
        id: "default",
        name: "Dev",
        command: project.command,
        autoStart: true,
        dependsOn: [],
        readiness: { kind: "process", value: "", timeoutSeconds: 30 },
      },
    ],
  };
}

function submitLabel(saving: boolean, editing: boolean): string {
  if (saving) return "Saving";
  return editing ? "Save changes" : "Add project";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
