import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Check,
  CircleAlert,
  Layers3,
  LoaderCircle,
  Pencil,
  Play,
  Plus,
  Square,
  Trash2,
  X,
} from "lucide-react";
import {
  deleteWorkspaceGroup,
  getWorkspaceGroups,
  saveWorkspaceGroup,
  startWorkspaceGroup,
  stopWorkspaceGroup,
} from "../lib/backend";
import type {
  ProjectView,
  WorkspaceGroup,
  WorkspaceGroupEntry,
  WorkspaceGroupTaskView,
  WorkspaceGroupView,
} from "../types";

interface Props {
  projects: ProjectView[];
  onClose: () => void;
  onProjectRefresh: () => void;
  onGroupCountChange: (count: number) => void;
  onNotify: (message: string, tone: "success" | "error") => void;
}

const EMPTY_GROUP: WorkspaceGroup = {
  id: "",
  name: "",
  entries: [],
};

export function WorkspaceGroupsPanel({
  projects,
  onClose,
  onProjectRefresh,
  onGroupCountChange,
  onNotify,
}: Props) {
  const [groups, setGroups] = useState<WorkspaceGroupView[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [draft, setDraft] = useState<WorkspaceGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const refreshGroups = useCallback(async () => {
    try {
      const nextGroups = await getWorkspaceGroups();
      setGroups(nextGroups);
      onGroupCountChange(nextGroups.length);
      setSelectedGroupId((current) => {
        if (current && nextGroups.some((group) => group.id === current)) return current;
        return nextGroups[0]?.id ?? null;
      });
    } catch (error) {
      onNotify(errorMessage(error), "error");
    } finally {
      setLoading(false);
    }
  }, [onGroupCountChange, onNotify]);

  useEffect(() => {
    void refreshGroups();
    const interval = window.setInterval(() => void refreshGroups(), 1_500);
    return () => window.clearInterval(interval);
  }, [refreshGroups]);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  );

  function editGroup(group: WorkspaceGroupView) {
    setDraft({
      id: group.id,
      name: group.name,
      entries: group.entries,
    });
    setConfirmDelete(false);
  }

  async function saveDraft(group: WorkspaceGroup) {
    setPending(true);
    try {
      const saved = await saveWorkspaceGroup(group);
      setDraft(null);
      setSelectedGroupId(saved.id);
      await refreshGroups();
      onNotify(`${saved.name} saved`, "success");
    } catch (error) {
      onNotify(errorMessage(error), "error");
    } finally {
      setPending(false);
    }
  }

  async function toggleGroup(group: WorkspaceGroupView) {
    setPending(true);
    try {
      if (group.runningTaskCount > 0) {
        await stopWorkspaceGroup(group.id);
        onNotify(`${group.name} stopped`, "success");
      } else {
        await startWorkspaceGroup(group.id);
        onNotify(`${group.name} started`, "success");
      }
      await refreshGroups();
      onProjectRefresh();
    } catch (error) {
      onNotify(errorMessage(error), "error");
    } finally {
      setPending(false);
    }
  }

  async function removeGroup(group: WorkspaceGroupView) {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setPending(true);
    try {
      await deleteWorkspaceGroup(group.id);
      setConfirmDelete(false);
      await refreshGroups();
      onNotify(`${group.name} removed`, "success");
    } catch (error) {
      onNotify(errorMessage(error), "error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="workspace-groups-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="workspace-groups-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-groups-title"
      >
        <header className="workspace-groups-header">
          <div>
            <p><Layers3 size={13} /> WORKSPACE GROUPS</p>
            <h2 id="workspace-groups-title">Start your stack together</h2>
            <span>Combine project tasks into reusable local workspaces.</span>
          </div>
          <button className="panel-close-button" onClick={onClose} aria-label="Close workspaces">
            <X size={16} />
          </button>
        </header>

        <div className="workspace-groups-body">
          <aside className="workspace-group-list-pane">
            <button
              className="workspace-new-group"
              onClick={() => {
                setDraft(EMPTY_GROUP);
                setConfirmDelete(false);
              }}
            >
              <Plus size={13} /> New workspace
            </button>
            {loading ? (
              <div className="workspace-groups-loading">
                <LoaderCircle className="spin" size={13} /> Loading
              </div>
            ) : (
              <nav aria-label="Workspace groups">
                {groups.map((group) => (
                  <button
                    key={group.id}
                    className="workspace-group-nav-item"
                    data-active={!draft && group.id === selectedGroupId}
                    onClick={() => {
                      setSelectedGroupId(group.id);
                      setDraft(null);
                      setConfirmDelete(false);
                    }}
                  >
                    <span className="workspace-group-icon"><Boxes size={13} /></span>
                    <span>
                      <strong>{group.name}</strong>
                      <small>
                        {group.runningTaskCount}/{group.tasks.length} running
                      </small>
                    </span>
                    <i data-running={group.runningTaskCount > 0} />
                  </button>
                ))}
              </nav>
            )}
          </aside>

          <main className="workspace-group-detail">
            {draft ? (
              <GroupEditor
                draft={draft}
                projects={projects}
                pending={pending}
                onChange={setDraft}
                onCancel={() => setDraft(null)}
                onSave={(group) => void saveDraft(group)}
              />
            ) : selectedGroup ? (
              <GroupDetail
                group={selectedGroup}
                pending={pending}
                confirmDelete={confirmDelete}
                onToggle={() => void toggleGroup(selectedGroup)}
                onEdit={() => editGroup(selectedGroup)}
                onDelete={() => void removeGroup(selectedGroup)}
              />
            ) : (
              <div className="workspace-group-empty">
                <span><Layers3 size={20} /></span>
                <h3>Build your first workspace</h3>
                <p>Group Web, API, Worker, or any other Runbox tasks behind one start button.</p>
                <button onClick={() => setDraft(EMPTY_GROUP)}>
                  <Plus size={13} /> New workspace
                </button>
              </div>
            )}
          </main>
        </div>
      </section>
    </div>
  );
}

function GroupEditor({
  draft,
  projects,
  pending,
  onChange,
  onCancel,
  onSave,
}: {
  draft: WorkspaceGroup;
  projects: ProjectView[];
  pending: boolean;
  onChange: (group: WorkspaceGroup) => void;
  onCancel: () => void;
  onSave: (group: WorkspaceGroup) => void;
}) {
  function toggleEntry(entry: WorkspaceGroupEntry) {
    const selected = hasEntry(draft.entries, entry);
    onChange({
      ...draft,
      entries: selected
        ? draft.entries.filter((item) => !sameEntry(item, entry))
        : [...draft.entries, entry],
    });
  }

  return (
    <div className="workspace-group-editor">
      <header>
        <div>
          <p>{draft.id ? "EDIT WORKSPACE" : "NEW WORKSPACE"}</p>
          <h3>{draft.id ? draft.name : "Choose tasks"}</h3>
        </div>
      </header>
      <label className="workspace-group-name">
        <span>Name</span>
        <input
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          placeholder="Full stack"
          autoFocus
        />
      </label>
      <div className="workspace-task-picker">
        {projects.map((project) => (
          <section key={project.id}>
            <header>
              <strong>{project.name}</strong>
              <span>{project.tasks.length} tasks</span>
            </header>
            <div>
              {project.tasks.map((task) => {
                const entry = { projectId: project.id, taskId: task.id };
                const selected = hasEntry(draft.entries, entry);
                return (
                  <button
                    key={task.id}
                    data-active={selected}
                    onClick={() => toggleEntry(entry)}
                  >
                    <span className="workspace-task-check">
                      {selected ? <Check size={11} strokeWidth={2.5} /> : null}
                    </span>
                    <span>
                      <strong>{task.name}</strong>
                      <code>{task.command}</code>
                    </span>
                    {task.autoStart ? <small>AUTO</small> : null}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <footer>
        <span>{draft.entries.length} tasks selected</span>
        <button className="secondary-button" onClick={onCancel}>Cancel</button>
        <button
          className="primary-button"
          onClick={() => onSave(draft)}
          disabled={pending || !draft.name.trim() || draft.entries.length === 0}
        >
          {pending ? <LoaderCircle className="spin" size={13} /> : null}
          Save workspace
        </button>
      </footer>
    </div>
  );
}

function GroupDetail({
  group,
  pending,
  confirmDelete,
  onToggle,
  onEdit,
  onDelete,
}: {
  group: WorkspaceGroupView;
  pending: boolean;
  confirmDelete: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const running = group.runningTaskCount > 0;
  return (
    <div className="workspace-group-overview">
      <header>
        <div>
          <p>WORKSPACE</p>
          <h3>{group.name}</h3>
          <span>
            {group.runningTaskCount} of {group.tasks.length} tasks running
            {group.crashedTaskCount > 0 ? ` · ${group.crashedTaskCount} unhealthy` : ""}
          </span>
        </div>
        <div>
          <button className="workspace-edit-button" onClick={onEdit}>
            <Pencil size={12} /> Edit
          </button>
          <button
            className="workspace-group-toggle"
            data-running={running}
            onClick={onToggle}
            disabled={pending}
          >
            <GroupActionIcon pending={pending} running={running} />
            {running ? "Stop workspace" : "Start workspace"}
          </button>
        </div>
      </header>
      <div className="workspace-group-task-list">
        {group.tasks.map((task) => (
          <div
            key={`${task.projectId}:${task.taskId}`}
            data-status={task.status}
            data-crashed={task.exitReason === "crashed"}
          >
            <span className="workspace-task-status">
              {task.exitReason === "crashed" && task.status !== "running" ? (
                <CircleAlert size={12} />
              ) : null}
            </span>
            <span>
              <strong>{task.taskName}</strong>
              <small>{task.projectName}</small>
            </span>
            <em>{workspaceTaskState(task)}</em>
          </div>
        ))}
      </div>
      <footer>
        <button className="workspace-delete-button" data-confirm={confirmDelete} onClick={onDelete}>
          <Trash2 size={12} />
          {confirmDelete ? "Click again to remove" : "Remove workspace"}
        </button>
      </footer>
    </div>
  );
}

function hasEntry(entries: WorkspaceGroupEntry[], candidate: WorkspaceGroupEntry): boolean {
  return entries.some((entry) => sameEntry(entry, candidate));
}

function sameEntry(left: WorkspaceGroupEntry, right: WorkspaceGroupEntry): boolean {
  return left.projectId === right.projectId && left.taskId === right.taskId;
}

function GroupActionIcon({ pending, running }: { pending: boolean; running: boolean }) {
  if (pending) return <LoaderCircle className="spin" size={13} />;
  if (running) return <Square size={10} fill="currentColor" />;
  return <Play size={11} fill="currentColor" />;
}

function workspaceTaskState(task: WorkspaceGroupTaskView): string {
  if (task.status === "running") return "Running";
  return task.exitReason === "crashed" ? "Crashed" : "Stopped";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
