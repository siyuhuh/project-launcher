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
}

export interface GitStatus {
  isRepo: boolean;
  branch: string;
  dirty: boolean;
  changed: number;
  ahead: number;
  behind: number;
}

export type ProjectForm = Project;

export interface ProjectDraft {
  name: string;
  path: string;
  command: string;
}
