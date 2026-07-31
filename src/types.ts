export type ProcessStatus = "running" | "stopped";
export type FinderTagColor =
  | "gray"
  | "green"
  | "purple"
  | "blue"
  | "yellow"
  | "red"
  | "orange";

export interface Project {
  id: string;
  name: string;
  path: string;
  command: string;
  tasks: ProjectTask[];
  favorite: boolean;
  sortOrder: number;
}

export interface ProjectView extends Project {
  status: ProcessStatus;
  pid: number | null;
  startedAt: number | null;
  stoppedAt: number | null;
  finderTagColor: FinderTagColor | null;
  gitStatus: GitStatus | null;
  taskCount: number;
  runningTaskCount: number;
  crashedTaskCount: number;
}

export interface ProjectTask {
  id: string;
  name: string;
  command: string;
  autoStart: boolean;
  dependsOn: string[];
  readiness: TaskReadiness;
}

export type TaskExitReason = "stopped" | "exited" | "crashed";
export type TaskLifecycleState =
  | "stopped"
  | "waiting"
  | "starting"
  | "running"
  | "ready"
  | "exited"
  | "crashed"
  | "blocked";
export type TaskReadinessKind = "process" | "port" | "http" | "log";

export interface TaskReadiness {
  kind: TaskReadinessKind;
  value: string;
  timeoutSeconds: number;
}

export interface TaskPort {
  host: string;
  port: number;
  url: string;
}

export interface TaskPortConflict {
  port: number;
  pid: number;
  processName: string;
  command: string;
}

export interface ProjectTaskView extends ProjectTask {
  status: ProcessStatus;
  pid: number | null;
  startedAt: number | null;
  stoppedAt: number | null;
  exitCode: number | null;
  exitReason: TaskExitReason | null;
  state: TaskLifecycleState;
  readyAt: number | null;
  lastError: string | null;
  cpuPercent: number;
  memoryBytes: number;
  ports: TaskPort[];
  expectedPort: number | null;
  portConflict: TaskPortConflict | null;
}

export interface WorkspaceGroupEntry {
  projectId: string;
  taskId: string;
}

export interface WorkspaceGroup {
  id: string;
  name: string;
  entries: WorkspaceGroupEntry[];
}

export interface WorkspaceGroupTaskView extends WorkspaceGroupEntry {
  projectName: string;
  taskName: string;
  status: ProcessStatus;
  exitReason: TaskExitReason | null;
  state: TaskLifecycleState;
}

export interface WorkspaceGroupView extends WorkspaceGroup {
  tasks: WorkspaceGroupTaskView[];
  runningTaskCount: number;
  crashedTaskCount: number;
  readyTaskCount: number;
  blockedTaskCount: number;
}

export interface GitStatus {
  isRepo: boolean;
  branch: string;
  dirty: boolean;
  changed: number;
  ahead: number;
  behind: number;
}

export interface GitWorkspace {
  branch: string;
  upstream: string | null;
  remoteUrl: string | null;
  ahead: number;
  behind: number;
  files: GitFileChange[];
  branches: string[];
}

export interface GitFileChange {
  path: string;
  status: string;
  staged: boolean;
  unstaged: boolean;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
  parents: string[];
  refs: string[];
}

export interface GitHistoryPage {
  commits: GitCommit[];
  offset: number;
  hasMore: boolean;
}

export interface GitCommitFile {
  path: string;
  previousPath: string | null;
  status: string;
}

export interface GitCommitDetail extends GitCommit {
  body: string;
  committedAt: string;
  files: GitCommitFile[];
  patch: string;
  patchTruncated: boolean;
}

export interface DeveloperTool {
  id: string;
  name: string;
  detail: string;
  kind: "editor" | "terminal" | "folder" | "remote";
}

export interface CommitMessageProvider {
  id: string;
  name: string;
  detail: string;
  local: boolean;
}

export type ProjectForm = Project;

export interface ProjectDraft {
  name: string;
  path: string;
  command: string;
  tasks: ProjectTask[];
}
