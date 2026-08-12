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
  Tag,
  Trash2,
  X,
  ZapOff,
} from "lucide-react";
import { detectProject } from "../lib/backend";
import { useI18n } from "../lib/i18n";
import type { ProjectForm, ProjectTask } from "../types";

interface Props {
  project: ProjectForm;
  onClose: () => void;
  onSave: (project: ProjectForm) => Promise<void>;
  onRequestDelete?: (project: ProjectForm) => void;
}

export function ProjectModal({ project, onClose, onSave, onRequestDelete }: Props) {
  const { t } = useI18n();
  const [form, setForm] = useState(() => ({ ...project, tags: [...project.tags] }));
  const [tagDraft, setTagDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [detectingTasks, setDetectingTasks] = useState(false);
  const [taskDetectionError, setTaskDetectionError] = useState<string | null>(null);
  const editing = Boolean(project.id);

  async function chooseFolder() {
    const path = await open({ directory: true, multiple: false });
    if (!path) return;
    try {
      const detected = await detectProject(path);
      setForm((current) => ({ ...current, ...detected, tags: current.tags }));
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
      await onSave({
        ...form,
        command: form.tasks[0]?.command ?? "",
        tags: mergeTags(form.tags, tagDraft),
      });
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
          name: current.tasks.length === 0 ? "Dev" : `Task ${current.tasks.length + 1}`,
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

  function addTag(value = tagDraft) {
    const additions = value
      .split(",")
      .map((tag) => tag.trim().replace(/^#+/, ""))
      .filter(Boolean);
    if (additions.length === 0) return;
    setForm((current) => {
      const tags = [...current.tags];
      for (const tag of additions) {
        if (tags.length >= 12) break;
        if (!tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
          tags.push(tag.slice(0, 32));
        }
      }
      return { ...current, tags };
    });
    setTagDraft("");
  }

  function removeTag(tag: string) {
    setForm((current) => ({
      ...current,
      tags: current.tags.filter((candidate) => candidate !== tag),
    }));
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
            <p className="eyebrow">{editing ? t("EDIT ENTRY") : t("NEW ENTRY")}</p>
            <h2 id="project-modal-title">{editing ? t("Project settings") : t("Add a project")}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label={t("Close")}><X size={16} /></button>
        </header>
        <form onSubmit={submit}>
          <label className="field-label" htmlFor="project-name">
            {t("Name")}
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
            {t("Project directory")}
            <span className="path-input">
              <input
                id="project-path"
                value={form.path}
                onChange={(event) => setForm({ ...form, path: event.target.value })}
                placeholder="~/Projects/my-web"
                required
              />
              <button type="button" onClick={() => void chooseFolder()}>
                <FolderOpen size={14} /> {t("Browse")}
              </button>
            </span>
          </label>
          <section className="project-tag-editor">
            <header>
              <div>
                <strong><Tag size={12} /> {t("Project tags")}</strong>
                <span>{t("Add searchable labels such as Unity, C#, client, or game.")}</span>
              </div>
              <small>{form.tags.length}/12</small>
            </header>
            {form.tags.length > 0 ? (
              <div className="project-tag-list">
                {form.tags.map((tag) => (
                  <span key={tag}>
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      aria-label={t("Remove tag {{tag}}", { tag })}
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <div className="project-tag-input">
              <input
                value={tagDraft}
                onChange={(event) => setTagDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === ",") {
                    event.preventDefault();
                    addTag();
                  }
                }}
                onBlur={() => addTag()}
                placeholder={t("Type a tag and press Enter")}
                maxLength={96}
                disabled={form.tags.length >= 12}
              />
              <button
                type="button"
                onClick={() => addTag()}
                disabled={!tagDraft.trim() || form.tags.length >= 12}
              >
                <Plus size={12} /> {t("Add")}
              </button>
            </div>
          </section>
          <section className="project-task-editor">
            <header>
              <div>
                <strong>{t("Project tasks")}</strong>
                <span>{t("Choose which long-running tasks start with the project.")}</span>
              </div>
              <div className="project-task-editor-actions">
                <button
                  type="button"
                  onClick={() => void detectTasks()}
                  disabled={detectingTasks || !form.path.trim()}
                >
                  <RefreshCw className={detectingTasks ? "spin" : undefined} size={12} />
                  {t("Import scripts")}
                </button>
                <button type="button" onClick={addTask}>
                  <Plus size={13} /> {t("Add task")}
                </button>
              </div>
            </header>
            {taskDetectionError ? (
              <p className="project-task-detection-error">{taskDetectionError}</p>
            ) : null}
            <div className="project-task-edit-list">
              {form.tasks.length === 0 ? (
                <div className="project-task-empty">
                  <ZapOff size={18} />
                  <div>
                    <strong>{t("No automation tasks")}</strong>
                    <span>{t("That is fine for Unity and other editor-driven projects. You can still use tags, Git, folders, terminals, and code language stats.")}</span>
                  </div>
                  <button type="button" onClick={addTask}>
                    <Plus size={12} /> {t("Add task")}
                  </button>
                </div>
              ) : null}
              {form.tasks.map((task, index) => (
                <article className="project-task-edit-row" key={task.id}>
                  <GripVertical size={13} aria-hidden="true" />
                  <div className="project-task-edit-fields">
                    <div>
                      <label>
                        <span>{index === 0 ? t("Primary task") : t("Task name")}</span>
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
                        <span>{t("Run with project")}</span>
                      </label>
                    </div>
                    <label>
                      <span>{t("Command")}</span>
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
                        <span>{t("Reliability")}</span>
                        <small>{readinessSummary(task, t)}</small>
                      </summary>
                      <div className="task-reliability-grid">
                        <label>
                          <span>{t("Ready when")}</span>
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
                            <option value="process">{t("Process stays running")}</option>
                            <option value="port">{t("Port is listening")}</option>
                            <option value="http">{t("HTTP endpoint responds")}</option>
                            <option value="log">{t("Log contains text")}</option>
                          </select>
                        </label>
                        {task.readiness.kind !== "process" ? (
                          <label className="task-readiness-value">
                            <span>{readinessValueLabel(task.readiness.kind, t)}</span>
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
                              placeholder={readinessPlaceholder(task.readiness.kind, t)}
                              required
                            />
                          </label>
                        ) : null}
                        <label className="task-readiness-timeout">
                          <span>{t("Timeout")}</span>
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
                            <small>{t("sec")}</small>
                          </span>
                        </label>
                      </div>
                      {form.tasks.length > 1 ? (
                        <div className="task-dependency-picker">
                          <span><GitMerge size={11} /> {t("Starts after")}</span>
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
                    aria-label={t("Remove {{name}}", { name: task.name || t("task") })}
                  >
                    {form.tasks.length === 1 ? <Trash2 size={12} /> : <X size={13} />}
                  </button>
                </article>
              ))}
            </div>
          </section>
          <p className="form-hint">
            {form.tasks.length > 0
              ? t("Commands use your login shell, so pnpm, NVM and other Terminal tools remain available. The first task remains compatible with the existing `p project` command.")
              : t("Automation is optional. This project will stay available for Git, terminal, folder, tags, and code insights.")}
          </p>
          <footer className="modal-footer">
            {onRequestDelete ? (
              <button
                className="delete-button"
                type="button"
                onClick={() => onRequestDelete(form)}
              >
                {t("Remove project...")}
              </button>
            ) : <span />}
            <div>
              <button className="secondary-button" type="button" onClick={onClose}>{t("Cancel")}</button>
              <button className="primary-button" type="submit" disabled={saving}>
                {saving ? <LoaderCircle className="spin" size={14} /> : null}
                {submitLabel(saving, editing, t)}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
}

function readinessSummary(task: ProjectTask, t: (key: string, values?: Record<string, string | number>) => string): string {
  switch (task.readiness.kind) {
    case "port":
      return task.readiness.value ? `${t("Port")} ${task.readiness.value}` : t("Port check");
    case "http":
      return task.readiness.value || t("HTTP check");
    case "log":
      return task.readiness.value ? `${t("Log")}: ${task.readiness.value}` : t("Log check");
    default:
      return t("Process check");
  }
}

function readinessValueLabel(
  kind: ProjectTask["readiness"]["kind"],
  t: (key: string) => string,
): string {
  if (kind === "port") return t("Port");
  if (kind === "http") return t("HTTP URL");
  return t("Log phrase");
}

function readinessPlaceholder(
  kind: ProjectTask["readiness"]["kind"],
  t: (key: string) => string,
): string {
  if (kind === "port") return "3000";
  if (kind === "http") return "http://localhost:3000/health";
  return t("ready in");
}

function submitLabel(saving: boolean, editing: boolean, t: (key: string) => string): string {
  if (saving) return t("Saving");
  return editing ? t("Save changes") : t("Add project");
}

function mergeTags(current: string[], draft: string): string[] {
  const tags = [...current];
  for (const tag of draft.split(",").map((value) => value.trim().replace(/^#+/, "")).filter(Boolean)) {
    if (tags.length >= 12) break;
    if (!tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
      tags.push(tag.slice(0, 32));
    }
  }
  return tags;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
