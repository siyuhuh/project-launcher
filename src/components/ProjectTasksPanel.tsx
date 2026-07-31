import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  CircleAlert,
  CircleStop,
  Cpu,
  ExternalLink,
  FileText,
  GitMerge,
  HardDrive,
  LoaderCircle,
  Network,
  Play,
  ShieldCheck,
  Square,
  Timer,
  TriangleAlert,
  Trash2,
  X,
} from "lucide-react";
import {
  clearProjectTaskLog,
  getProjectTasks,
  openProjectTaskPort,
  readProjectTaskLog,
  startProject,
  startProjectTask,
  stopProject,
  stopProjectTask,
} from "../lib/backend";
import type { ProjectTaskView, ProjectView } from "../types";

interface Props {
  project: ProjectView;
  onClose: () => void;
  onProjectRefresh: () => void;
  onNotify: (message: string, tone: "success" | "error") => void;
}

export function ProjectTasksPanel({
  project,
  onClose,
  onProjectRefresh,
  onNotify,
}: Props) {
  const [tasks, setTasks] = useState<ProjectTaskView[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [logContents, setLogContents] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(() => new Set());
  const [projectPending, setProjectPending] = useState(false);

  const refreshTasks = useCallback(async () => {
    try {
      const nextTasks = await getProjectTasks(project.id);
      setTasks(nextTasks);
      setSelectedTaskId((current) => {
        if (current && nextTasks.some((task) => task.id === current)) return current;
        return nextTasks[0]?.id ?? null;
      });
    } catch (error) {
      onNotify(errorMessage(error), "error");
    } finally {
      setLoading(false);
    }
  }, [onNotify, project.id]);

  useEffect(() => {
    void refreshTasks();
    const interval = window.setInterval(() => void refreshTasks(), 1_300);
    return () => window.clearInterval(interval);
  }, [refreshTasks]);

  useEffect(() => {
    if (!selectedTaskId) {
      setLogContents("");
      return;
    }
    async function updateLog() {
      try {
        setLogContents(await readProjectTaskLog(project.id, selectedTaskId!, 500));
      } catch (error) {
        onNotify(errorMessage(error), "error");
      }
    }
    void updateLog();
    const interval = window.setInterval(updateLog, 700);
    return () => window.clearInterval(interval);
  }, [onNotify, project.id, selectedTaskId]);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, tasks],
  );
  const runningTaskCount = tasks.filter((task) => task.status === "running").length;
  const projectRunning = runningTaskCount > 0;

  async function toggleTask(task: ProjectTaskView) {
    setPendingTaskIds((current) => new Set(current).add(task.id));
    try {
      if (task.status === "running") {
        await stopProjectTask(project.id, task.id);
        onNotify(`${task.name} stopped`, "success");
      } else {
        await startProjectTask(project.id, task.id);
        onNotify(`${task.name} started`, "success");
      }
      await refreshTasks();
      onProjectRefresh();
    } catch (error) {
      onNotify(errorMessage(error), "error");
    } finally {
      setPendingTaskIds((current) => withoutId(current, task.id));
    }
  }

  async function toggleProject() {
    setProjectPending(true);
    try {
      if (projectRunning) {
        await stopProject(project.id);
        onNotify(`${project.name} stopped`, "success");
      } else {
        await startProject(project.id);
        onNotify(`${project.name} tasks started`, "success");
      }
      await refreshTasks();
      onProjectRefresh();
    } catch (error) {
      onNotify(errorMessage(error), "error");
    } finally {
      setProjectPending(false);
    }
  }

  async function clearSelectedLog() {
    if (!selectedTask) return;
    try {
      await clearProjectTaskLog(project.id, selectedTask.id);
      setLogContents("");
    } catch (error) {
      onNotify(errorMessage(error), "error");
    }
  }

  return (
    <div
      className="task-panel-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="task-workspace"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-workspace-title"
      >
        <header className="task-workspace-header">
          <div>
            <p className="task-workspace-kicker"><Activity size={13} /> TASKS &amp; HEALTH</p>
            <h2 id="task-workspace-title">{project.name}</h2>
            <p>{project.path}</p>
          </div>
          <div className="task-workspace-header-actions">
            <span className="task-project-summary" data-running={projectRunning}>
              <i /> {runningTaskCount}/{tasks.length} running
            </span>
            <button
              className="task-project-toggle"
              data-running={projectRunning}
              onClick={() => void toggleProject()}
              disabled={projectPending || loading}
            >
              <TaskActionIcon
                pending={projectPending}
                running={projectRunning}
                squareSize={11}
                playSize={12}
              />
              {projectRunning ? "Stop all" : "Run project"}
            </button>
            <button className="panel-close-button" onClick={onClose} aria-label="Close task workspace">
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="task-workspace-body">
          <aside className="task-list-pane">
            <header>
              <span>PROJECT TASKS</span>
              <strong>{tasks.length}</strong>
            </header>
            {loading ? (
              <div className="task-loading-state">
                <LoaderCircle className="spin" size={14} /> Reading processes
              </div>
            ) : (
              <div className="task-list">
                {tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    selected={task.id === selectedTaskId}
                    pending={pendingTaskIds.has(task.id)}
                    onSelect={() => setSelectedTaskId(task.id)}
                    onToggle={() => void toggleTask(task)}
                  />
                ))}
              </div>
            )}
          </aside>

          <main className="task-health-pane">
            {selectedTask ? (
              <>
                <TaskHealthHeader
                  task={selectedTask}
                  pending={pendingTaskIds.has(selectedTask.id)}
                  onToggle={() => void toggleTask(selectedTask)}
                />
                <div className="task-health-scroll">
                  <HealthSummary task={selectedTask} />
                  <TaskReliability task={selectedTask} tasks={tasks} />
                  {selectedTask.portConflict ? (
                    <section className="task-runtime-notice" data-tone="error">
                      <TriangleAlert size={14} />
                      <div>
                        <strong>Port {selectedTask.portConflict.port} is already in use</strong>
                        <span>
                          {selectedTask.portConflict.processName} · PID {selectedTask.portConflict.pid}
                        </span>
                        <code>{selectedTask.portConflict.command}</code>
                      </div>
                    </section>
                  ) : selectedTask.lastError ? (
                    <section className="task-runtime-notice" data-tone="error">
                      <CircleAlert size={14} />
                      <div>
                        <strong>{taskStateLabel(selectedTask)}</strong>
                        <span>{selectedTask.lastError}</span>
                      </div>
                    </section>
                  ) : null}
                  <section className="task-port-section">
                    <header>
                      <div><Network size={13} /> Listening ports</div>
                      <span>{selectedTask.ports.length}</span>
                    </header>
                    {selectedTask.ports.length > 0 ? (
                      <div className="task-port-list">
                        {selectedTask.ports.map((port) => (
                          <button
                            key={port.port}
                            onClick={() =>
                              void openProjectTaskPort(project.id, selectedTask.id, port.port).catch(
                                (error) => onNotify(errorMessage(error), "error"),
                              )
                            }
                          >
                            <span>
                              <strong>localhost:{port.port}</strong>
                              <small>{port.host || "local interface"}</small>
                            </span>
                            <code>{port.url}</code>
                            <ExternalLink size={12} />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="task-port-empty">
                        {selectedTask.status === "running"
                          ? "No listening TCP ports detected yet."
                          : "Start this task to detect its localhost addresses."}
                      </p>
                    )}
                  </section>

                  <section className="task-log-section">
                    <header>
                      <div><FileText size={13} /> Recent output</div>
                      <button onClick={() => void clearSelectedLog()}>
                        <Trash2 size={11} /> Clear
                      </button>
                    </header>
                    <pre>
                      {logContents || (
                        <span className="task-log-empty">
                          No output yet. Start the task to stream its logs here.
                        </span>
                      )}
                    </pre>
                  </section>
                </div>
              </>
            ) : (
              <div className="task-empty-state">Choose a task to inspect its health.</div>
            )}
          </main>
        </div>
      </section>
    </div>
  );
}

function TaskRow({
  task,
  selected,
  pending,
  onSelect,
  onToggle,
}: {
  task: ProjectTaskView;
  selected: boolean;
  pending: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  const health = taskHealth(task);
  return (
    <div className="task-row" data-active={selected} data-health={health}>
      <button className="task-row-main" onClick={onSelect}>
        <span className="task-status-dot" />
        <span className="task-row-copy">
          <strong>{task.name}</strong>
          <code>{task.command}</code>
          <small>
            {task.status === "running"
              ? `${taskStateLabel(task)} · ${formatCpu(task.cpuPercent)} CPU · ${formatMemory(task.memoryBytes)}`
              : taskStateLabel(task)}
          </small>
        </span>
        {task.autoStart ? <span className="task-auto-badge">AUTO</span> : null}
      </button>
      <button
        className="task-row-toggle"
        data-running={task.status === "running"}
        onClick={onToggle}
        disabled={pending}
        aria-label={`${task.status === "running" ? "Stop" : "Start"} ${task.name}`}
      >
        <TaskActionIcon
          pending={pending}
          running={task.status === "running"}
          loaderSize={12}
          squareSize={9}
          playSize={10}
        />
      </button>
    </div>
  );
}

function TaskHealthHeader({
  task,
  pending,
  onToggle,
}: {
  task: ProjectTaskView;
  pending: boolean;
  onToggle: () => void;
}) {
  return (
    <header className="task-health-header" data-health={taskHealth(task)}>
      <div>
        <span className="task-status-dot" />
        <div>
          <div className="task-health-title">
            <h3>{task.name}</h3>
            <span data-state={task.state}>{taskStateLabel(task)}</span>
          </div>
          <code>$ {task.command}</code>
        </div>
      </div>
      <button
        className="task-toggle-button"
        data-running={task.status === "running"}
        onClick={onToggle}
        disabled={pending}
      >
        <TaskActionIcon
          pending={pending}
          running={task.status === "running"}
          squareSize={10}
          playSize={11}
        />
        {task.status === "running" ? "Stop task" : "Start task"}
      </button>
    </header>
  );
}

function HealthSummary({ task }: { task: ProjectTaskView }) {
  return (
    <section className="task-health-grid">
      <HealthMetric
        icon={<Cpu size={13} />}
        label="CPU"
        value={task.status === "running" ? formatCpu(task.cpuPercent) : "—"}
      />
      <HealthMetric
        icon={<HardDrive size={13} />}
        label="Memory"
        value={task.status === "running" ? formatMemory(task.memoryBytes) : "—"}
      />
      <HealthMetric
        icon={<Activity size={13} />}
        label="State"
        value={taskStateLabel(task)}
        tone={task.state === "crashed" || task.state === "blocked" ? "error" : undefined}
      />
      <HealthMetric
        icon={task.exitReason === "crashed" ? <CircleAlert size={13} /> : <CircleStop size={13} />}
        label={taskProcessLabel(task)}
        value={taskProcessSummary(task)}
        tone={task.exitReason === "crashed" ? "error" : undefined}
      />
    </section>
  );
}

function HealthMetric({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: "error";
}) {
  return (
    <div className="task-health-metric" data-tone={tone}>
      <span>{icon}{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TaskReliability({ task, tasks }: { task: ProjectTaskView; tasks: ProjectTaskView[] }) {
  const dependencyNames = task.dependsOn.map(
    (dependencyId) => tasks.find((candidate) => candidate.id === dependencyId)?.name ?? dependencyId,
  );
  return (
    <section className="task-reliability-summary">
      <div>
        <ShieldCheck size={13} />
        <span>
          <small>Ready when</small>
          <strong>{readinessDescription(task)}</strong>
        </span>
      </div>
      <div>
        <GitMerge size={13} />
        <span>
          <small>Starts after</small>
          <strong>{dependencyNames.length > 0 ? dependencyNames.join(" · ") : "No dependencies"}</strong>
        </span>
      </div>
      <div>
        <Timer size={13} />
        <span>
          <small>Timeout</small>
          <strong>{task.readiness.timeoutSeconds}s</strong>
        </span>
      </div>
    </section>
  );
}

function taskHealth(
  task: ProjectTaskView,
): "running" | "ready" | "waiting" | "starting" | "blocked" | "crashed" | "exited" | "stopped" {
  if (task.state === "ready") return "ready";
  if (task.state === "waiting") return "waiting";
  if (task.state === "starting") return "starting";
  if (task.state === "blocked") return "blocked";
  if (task.state === "crashed") return "crashed";
  if (task.state === "exited") return "exited";
  if (task.status === "running" || task.state === "running") return "running";
  return "stopped";
}

function TaskActionIcon({
  pending,
  running,
  loaderSize = 13,
  squareSize,
  playSize,
}: {
  pending: boolean;
  running: boolean;
  loaderSize?: number;
  squareSize: number;
  playSize: number;
}) {
  if (pending) return <LoaderCircle className="spin" size={loaderSize} />;
  if (running) return <Square size={squareSize} fill="currentColor" />;
  return <Play size={playSize} fill="currentColor" />;
}

function taskStateLabel(task: ProjectTaskView): string {
  switch (task.state) {
    case "ready":
      return "Ready";
    case "running":
      return "Running";
    case "waiting":
      return "Waiting";
    case "starting":
      return "Starting";
    case "blocked":
      return "Blocked";
    case "crashed":
      return task.exitCode === null ? "Crashed" : `Crashed · exit ${task.exitCode}`;
    case "exited":
      return task.exitCode === null ? "Completed" : `Completed · exit ${task.exitCode}`;
    case "stopped":
      return task.exitReason === "stopped" ? "Stopped by you" : "Stopped";
  }
}

function readinessDescription(task: ProjectTaskView): string {
  switch (task.readiness.kind) {
    case "process":
      return "Process stays alive";
    case "port":
      return `Port ${task.readiness.value} listens`;
    case "http":
      return task.readiness.value;
    case "log":
      return `Log contains “${task.readiness.value}”`;
  }
}

function taskProcessSummary(task: ProjectTaskView): string {
  if (task.status === "running") return formatUptime(task.startedAt);
  if (task.pid) return `PID ${task.pid}`;
  return task.exitCode === null ? "—" : String(task.exitCode);
}

function taskProcessLabel(task: ProjectTaskView): string {
  if (task.status === "running") return "Uptime";
  return task.pid ? "Process" : "Exit code";
}

function formatCpu(value: number): string {
  return `${value < 10 ? value.toFixed(1) : value.toFixed(0)}%`;
}

function formatMemory(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const megabytes = bytes / (1024 * 1024);
  if (megabytes < 1024) return `${megabytes.toFixed(megabytes < 100 ? 1 : 0)} MB`;
  return `${(megabytes / 1024).toFixed(1)} GB`;
}

function formatUptime(startedAt: number | null): string {
  if (!startedAt) return "a moment";
  const elapsed = Math.max(0, Math.floor(Date.now() / 1_000) - startedAt);
  if (elapsed < 60) return `${elapsed}s`;
  if (elapsed < 3_600) return `${Math.floor(elapsed / 60)}m`;
  return `${Math.floor(elapsed / 3_600)}h ${Math.floor((elapsed % 3_600) / 60)}m`;
}

function withoutId(values: Set<string>, id: string): Set<string> {
  const next = new Set(values);
  next.delete(id);
  return next;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
