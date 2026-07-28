import { invoke } from "@tauri-apps/api/core";
import type {
  CommitMessageProvider,
  GitWorkspace,
  Project,
  ProjectDraft,
  ProjectForm,
  ProjectView,
} from "../types";

export function getProjects(): Promise<ProjectView[]> {
  return invoke("get_projects");
}

export function saveProject(project: ProjectForm): Promise<Project> {
  return invoke("save_project", { project });
}

export function setProjectFavorite(projectId: string, favorite: boolean): Promise<Project> {
  return invoke("set_favorite", { projectId, favorite });
}

export function reorderProjects(projectIds: string[]): Promise<void> {
  return invoke("reorder_project_list", { projectIds });
}

export function refreshFinderColors(): Promise<void> {
  return invoke("refresh_finder_colors");
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

export function getGitWorkspace(projectId: string): Promise<GitWorkspace> {
  return invoke("get_git_workspace", { projectId });
}

export function getGitDiff(
  projectId: string,
  filePath: string,
  staged: boolean,
): Promise<string> {
  return invoke("get_git_diff", { projectId, filePath, staged });
}

export function stageGitFiles(projectId: string, paths: string[]): Promise<GitWorkspace> {
  return invoke("stage_git_files", { projectId, paths });
}

export function unstageGitFiles(projectId: string, paths: string[]): Promise<GitWorkspace> {
  return invoke("unstage_git_files", { projectId, paths });
}

export function createCommit(projectId: string, message: string): Promise<GitWorkspace> {
  return invoke("create_commit", { projectId, message });
}

export function getCommitMessageProviders(): Promise<CommitMessageProvider[]> {
  return invoke("get_commit_message_providers");
}

export function generateCommitMessage(
  projectId: string,
  providerId: string,
): Promise<string> {
  return invoke("generate_commit_message", { projectId, providerId });
}

export function createBranch(projectId: string, branch: string): Promise<GitWorkspace> {
  return invoke("create_branch", { projectId, branch });
}

export function switchBranch(projectId: string, branch: string): Promise<GitWorkspace> {
  return invoke("switch_branch", { projectId, branch });
}

export function fetchRepository(projectId: string): Promise<GitWorkspace> {
  return invoke("fetch_repository", { projectId });
}

export function pullRepository(projectId: string): Promise<GitWorkspace> {
  return invoke("pull_repository", { projectId });
}

export function pushRepository(projectId: string): Promise<GitWorkspace> {
  return invoke("push_repository", { projectId });
}
