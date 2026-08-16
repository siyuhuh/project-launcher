pub mod core;

use core::{
    CommitMessageProvider, DeveloperTool, GitCommitDetail, GitHistoryPage, GitWorkspace, Project,
    ProjectDraft, ProjectTaskView, ProjectView, WorkspaceGroup, WorkspaceGroupView,
};

#[tauri::command]
fn get_projects() -> Result<Vec<ProjectView>, String> {
    core::list_project_views()
}

#[tauri::command]
fn save_project(project: Project) -> Result<Project, String> {
    core::upsert_project(project)
}

#[tauri::command]
fn set_favorite(project_id: String, favorite: bool) -> Result<Project, String> {
    core::set_project_favorite(&project_id, favorite)
}

#[tauri::command]
fn reorder_project_list(project_ids: Vec<String>) -> Result<(), String> {
    core::reorder_projects(&project_ids)
}

#[tauri::command]
fn refresh_finder_colors() -> Result<(), String> {
    core::refresh_finder_tags()
}

#[tauri::command]
fn remove_project(project_id: String) -> Result<(), String> {
    core::delete_project(&project_id)
}

#[tauri::command]
async fn trash_project_directory(project_id: String) -> Result<(), String> {
    run_blocking(move || core::trash_project_directory(&project_id)).await
}

#[tauri::command]
fn detect_project(path: String) -> Result<ProjectDraft, String> {
    core::inspect_project(&path)
}

#[tauri::command]
fn launch_project(project_id: String) -> Result<ProjectView, String> {
    core::start_project(&project_id)
}

#[tauri::command]
fn halt_project(project_id: String) -> Result<ProjectView, String> {
    core::stop_project(&project_id)
}

#[tauri::command]
fn get_project_tasks(project_id: String) -> Result<Vec<ProjectTaskView>, String> {
    core::project_tasks(&project_id)
}

#[tauri::command]
fn launch_project_task(project_id: String, task_id: String) -> Result<ProjectTaskView, String> {
    core::start_project_task(&project_id, &task_id)
}

#[tauri::command]
fn halt_project_task(project_id: String, task_id: String) -> Result<ProjectTaskView, String> {
    core::stop_project_task(&project_id, &task_id)
}

#[tauri::command]
fn read_project_log(project_id: String, max_lines: usize) -> Result<String, String> {
    core::project_log(&project_id, max_lines)
}

#[tauri::command]
fn read_project_task_log(
    project_id: String,
    task_id: String,
    max_lines: usize,
) -> Result<String, String> {
    core::project_task_log(&project_id, &task_id, max_lines)
}

#[tauri::command]
fn clear_log(project_id: String) -> Result<(), String> {
    core::clear_project_log(&project_id)
}

#[tauri::command]
fn clear_task_log(project_id: String, task_id: String) -> Result<(), String> {
    core::clear_project_task_log(&project_id, &task_id)
}

#[tauri::command]
fn open_task_port(project_id: String, task_id: String, port: u16) -> Result<(), String> {
    core::open_project_task_port(&project_id, &task_id, port)
}

#[tauri::command]
fn get_workspace_groups() -> Result<Vec<WorkspaceGroupView>, String> {
    core::list_workspace_groups()
}

#[tauri::command]
fn save_workspace_group(group: WorkspaceGroup) -> Result<WorkspaceGroupView, String> {
    core::upsert_workspace_group(group)
}

#[tauri::command]
fn remove_workspace_group(group_id: String) -> Result<(), String> {
    core::delete_workspace_group(&group_id)
}

#[tauri::command]
fn launch_workspace_group(group_id: String) -> Result<WorkspaceGroupView, String> {
    core::start_workspace_group(&group_id)
}

#[tauri::command]
fn halt_workspace_group(group_id: String) -> Result<WorkspaceGroupView, String> {
    core::stop_workspace_group(&group_id)
}

#[tauri::command]
fn show_in_folder(project_id: String) -> Result<(), String> {
    core::open_project_directory(&project_id)
}

#[tauri::command]
fn show_in_terminal(project_id: String) -> Result<(), String> {
    core::open_project_terminal(&project_id)
}

#[tauri::command]
async fn get_git_workspace(project_id: String) -> Result<GitWorkspace, String> {
    run_blocking(move || core::git_workspace(&project_id)).await
}

#[tauri::command]
async fn get_git_diff(
    project_id: String,
    file_path: String,
    staged: bool,
) -> Result<String, String> {
    run_blocking(move || core::git_diff(&project_id, &file_path, staged)).await
}

#[tauri::command]
async fn get_git_history(
    project_id: String,
    offset: usize,
    limit: usize,
    file_path: Option<String>,
    all_branches: bool,
) -> Result<GitHistoryPage, String> {
    run_blocking(move || {
        core::git_history(
            &project_id,
            offset,
            limit,
            file_path.as_deref(),
            all_branches,
        )
    })
    .await
}

#[tauri::command]
async fn get_git_commit_detail(
    project_id: String,
    commit_hash: String,
) -> Result<GitCommitDetail, String> {
    run_blocking(move || core::git_commit_detail(&project_id, &commit_hash)).await
}

#[tauri::command]
async fn revert_git_commit(
    project_id: String,
    commit_hash: String,
) -> Result<GitWorkspace, String> {
    run_blocking(move || core::revert_git_commit(&project_id, &commit_hash)).await
}

#[tauri::command]
async fn get_developer_tools(project_id: String) -> Result<Vec<DeveloperTool>, String> {
    run_blocking(move || core::developer_tools(&project_id)).await
}

#[tauri::command]
async fn open_developer_tool(project_id: String, tool_id: String) -> Result<(), String> {
    run_blocking(move || core::open_developer_tool(&project_id, &tool_id)).await
}

#[tauri::command]
async fn stage_git_files(project_id: String, paths: Vec<String>) -> Result<GitWorkspace, String> {
    run_blocking(move || core::stage_git_paths(&project_id, &paths)).await
}

#[tauri::command]
async fn unstage_git_files(project_id: String, paths: Vec<String>) -> Result<GitWorkspace, String> {
    run_blocking(move || core::unstage_git_paths(&project_id, &paths)).await
}

#[tauri::command]
async fn discard_git_files(project_id: String, paths: Vec<String>) -> Result<GitWorkspace, String> {
    run_blocking(move || core::discard_git_paths(&project_id, &paths)).await
}

#[tauri::command]
async fn discard_all_git_changes(project_id: String) -> Result<GitWorkspace, String> {
    run_blocking(move || core::discard_all_git_changes(&project_id)).await
}

#[tauri::command]
async fn create_stash(
    project_id: String,
    message: String,
    include_untracked: bool,
) -> Result<GitWorkspace, String> {
    run_blocking(move || core::create_git_stash(&project_id, &message, include_untracked)).await
}

#[tauri::command]
async fn apply_stash(
    project_id: String,
    stash_reference: String,
    pop: bool,
) -> Result<GitWorkspace, String> {
    run_blocking(move || core::apply_git_stash(&project_id, &stash_reference, pop)).await
}

#[tauri::command]
async fn drop_stash(project_id: String, stash_reference: String) -> Result<GitWorkspace, String> {
    run_blocking(move || core::drop_git_stash(&project_id, &stash_reference)).await
}

#[tauri::command]
async fn create_commit(project_id: String, message: String) -> Result<GitWorkspace, String> {
    run_blocking(move || core::commit_git(&project_id, &message)).await
}

#[tauri::command]
async fn get_commit_message_providers() -> Result<Vec<CommitMessageProvider>, String> {
    run_blocking(core::list_commit_message_providers).await
}

#[tauri::command]
fn open_local_ai_setup() -> Result<(), String> {
    core::open_local_ai_setup()
}

#[tauri::command]
async fn generate_commit_message(
    project_id: String,
    provider_id: String,
) -> Result<String, String> {
    run_blocking(move || core::generate_commit_message(&project_id, &provider_id)).await
}

#[tauri::command]
async fn create_branch(project_id: String, branch: String) -> Result<GitWorkspace, String> {
    run_blocking(move || core::create_git_branch(&project_id, &branch)).await
}

#[tauri::command]
async fn create_branch_from_commit(
    project_id: String,
    branch: String,
    commit_hash: String,
) -> Result<GitWorkspace, String> {
    run_blocking(move || core::create_git_branch_from_commit(&project_id, &branch, &commit_hash))
        .await
}

#[tauri::command]
async fn switch_branch(project_id: String, branch: String) -> Result<GitWorkspace, String> {
    run_blocking(move || core::switch_git_branch(&project_id, &branch)).await
}

#[tauri::command]
async fn rename_branch(
    project_id: String,
    branch: String,
    next_branch: String,
) -> Result<GitWorkspace, String> {
    run_blocking(move || core::rename_git_branch(&project_id, &branch, &next_branch)).await
}

#[tauri::command]
async fn delete_branch(
    project_id: String,
    branch: String,
    force: bool,
) -> Result<GitWorkspace, String> {
    run_blocking(move || core::delete_git_branch(&project_id, &branch, force)).await
}

#[tauri::command]
async fn merge_branch(project_id: String, branch: String) -> Result<GitWorkspace, String> {
    run_blocking(move || core::merge_git_branch(&project_id, &branch)).await
}

#[tauri::command]
async fn rebase_branch(project_id: String, branch: String) -> Result<GitWorkspace, String> {
    run_blocking(move || core::rebase_git_branch(&project_id, &branch)).await
}

#[tauri::command]
async fn cherry_pick_commit(
    project_id: String,
    commit_hash: String,
) -> Result<GitWorkspace, String> {
    run_blocking(move || core::cherry_pick_git_commit(&project_id, &commit_hash)).await
}

#[tauri::command]
async fn fetch_repository(project_id: String) -> Result<GitWorkspace, String> {
    run_blocking(move || core::fetch_git(&project_id)).await
}

#[tauri::command]
async fn pull_repository(project_id: String) -> Result<GitWorkspace, String> {
    run_blocking(move || core::pull_git(&project_id)).await
}

#[tauri::command]
async fn push_repository(project_id: String) -> Result<GitWorkspace, String> {
    run_blocking(move || core::push_git(&project_id)).await
}

async fn run_blocking<T, F>(task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| error.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_projects,
            save_project,
            set_favorite,
            reorder_project_list,
            refresh_finder_colors,
            remove_project,
            trash_project_directory,
            detect_project,
            launch_project,
            halt_project,
            get_project_tasks,
            launch_project_task,
            halt_project_task,
            read_project_log,
            read_project_task_log,
            clear_log,
            clear_task_log,
            open_task_port,
            get_workspace_groups,
            save_workspace_group,
            remove_workspace_group,
            launch_workspace_group,
            halt_workspace_group,
            show_in_folder,
            show_in_terminal,
            get_git_workspace,
            get_git_diff,
            get_git_history,
            get_git_commit_detail,
            revert_git_commit,
            get_developer_tools,
            open_developer_tool,
            stage_git_files,
            unstage_git_files,
            discard_git_files,
            discard_all_git_changes,
            create_stash,
            apply_stash,
            drop_stash,
            create_commit,
            get_commit_message_providers,
            open_local_ai_setup,
            generate_commit_message,
            create_branch,
            create_branch_from_commit,
            switch_branch,
            rename_branch,
            delete_branch,
            merge_branch,
            rebase_branch,
            cherry_pick_commit,
            fetch_repository,
            pull_repository,
            push_repository,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Runbox");
}
