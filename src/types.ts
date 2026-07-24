export type ProcessStatus = "running" | "stopped";

export interface Project {
  id: string;
  name: string;
  path: string;
  command: string;
  favorite: boolean;
}

export interface ProjectView extends Project {
  status: ProcessStatus;
  pid: number | null;
  startedAt: number | null;
  stoppedAt: number | null;
}

export type ProjectForm = Project;

export interface ProjectDraft {
  name: string;
  path: string;
  command: string;
}
