import { invoke } from "@tauri-apps/api/core";
import type { Project, ProjectDraft, ProjectForm, ProjectView } from "../types";

export function getProjects(): Promise<ProjectView[]> {
  return invoke("get_projects");
}

export function saveProject(project: ProjectForm): Promise<Project> {
  return invoke("save_project", { project });
}

export function deleteProject(projectId: string): Promise<void> {
  return invoke("remove_project", { projectId });
}

export function detectProject(path: string): Promise<ProjectDraft> {
  return invoke("detect_project", { path });
}

export function startProject(projectId: string): Promise<ProjectView> {
  return invoke("launch_project", { projectId });
}

export function stopProject(projectId: string): Promise<ProjectView> {
  return invoke("halt_project", { projectId });
}

export function readProjectLog(projectId: string, maxLines: number): Promise<string> {
  return invoke("read_project_log", { projectId, maxLines });
}

export function clearProjectLog(projectId: string): Promise<void> {
  return invoke("clear_log", { projectId });
}

export function openProjectFolder(projectId: string): Promise<void> {
  return invoke("show_in_folder", { projectId });
}

export function openProjectTerminal(projectId: string): Promise<void> {
  return invoke("show_in_terminal", { projectId });
}
