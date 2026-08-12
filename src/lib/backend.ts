import { invoke } from "@tauri-apps/api/core";
import type {
  CommitMessageProvider,
  DeveloperTool,
  GitCommitDetail,
  GitHistoryPage,
  GitWorkspace,
  Project,
  ProjectDraft,
  ProjectForm,
  ProjectTaskView,
  ProjectView,
  WorkspaceGroup,
  WorkspaceGroupView,
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

export function removeProjectBinding(projectId: string): Promise<void> {
  return invoke("remove_project", { projectId });
}

export function trashProjectDirectory(projectId: string): Promise<void> {
  return invoke("trash_project_directory", { projectId });
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

export function getProjectTasks(projectId: string): Promise<ProjectTaskView[]> {
  return invoke("get_project_tasks", { projectId });
}

export function startProjectTask(
  projectId: string,
  taskId: string,
): Promise<ProjectTaskView> {
  return invoke("launch_project_task", { projectId, taskId });
}

export function stopProjectTask(
  projectId: string,
  taskId: string,
): Promise<ProjectTaskView> {
  return invoke("halt_project_task", { projectId, taskId });
}

export function readProjectLog(projectId: string, maxLines: number): Promise<string> {
  return invoke("read_project_log", { projectId, maxLines });
}

export function readProjectTaskLog(
  projectId: string,
  taskId: string,
  maxLines: number,
): Promise<string> {
  return invoke("read_project_task_log", { projectId, taskId, maxLines });
}

export function clearProjectLog(projectId: string): Promise<void> {
  return invoke("clear_log", { projectId });
}

export function clearProjectTaskLog(projectId: string, taskId: string): Promise<void> {
  return invoke("clear_task_log", { projectId, taskId });
}

export function openProjectTaskPort(
  projectId: string,
  taskId: string,
  port: number,
): Promise<void> {
  return invoke("open_task_port", { projectId, taskId, port });
}

export function getWorkspaceGroups(): Promise<WorkspaceGroupView[]> {
  return invoke("get_workspace_groups");
}

export function saveWorkspaceGroup(group: WorkspaceGroup): Promise<WorkspaceGroupView> {
  return invoke("save_workspace_group", { group });
}

export function deleteWorkspaceGroup(groupId: string): Promise<void> {
  return invoke("remove_workspace_group", { groupId });
}

export function startWorkspaceGroup(groupId: string): Promise<WorkspaceGroupView> {
  return invoke("launch_workspace_group", { groupId });
}

export function stopWorkspaceGroup(groupId: string): Promise<WorkspaceGroupView> {
  return invoke("halt_workspace_group", { groupId });
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

export function getGitHistory(
  projectId: string,
  offset: number,
  limit: number,
  filePath: string | null,
): Promise<GitHistoryPage> {
  return invoke("get_git_history", { projectId, offset, limit, filePath });
}

export function getGitCommitDetail(
  projectId: string,
  commitHash: string,
): Promise<GitCommitDetail> {
  return invoke("get_git_commit_detail", { projectId, commitHash });
}

export function revertGitCommit(
  projectId: string,
  commitHash: string,
): Promise<GitWorkspace> {
  return invoke("revert_git_commit", { projectId, commitHash });
}

export function getDeveloperTools(projectId: string): Promise<DeveloperTool[]> {
  return invoke("get_developer_tools", { projectId });
}

export function openDeveloperTool(projectId: string, toolId: string): Promise<void> {
  return invoke("open_developer_tool", { projectId, toolId });
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

export function openLocalAiSetup(): Promise<void> {
  return invoke("open_local_ai_setup");
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
