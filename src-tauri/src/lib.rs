pub mod core;

use core::{CommitMessageProvider, GitWorkspace, Project, ProjectDraft, ProjectView};

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
fn read_project_log(project_id: String, max_lines: usize) -> Result<String, String> {
    core::project_log(&project_id, max_lines)
}

#[tauri::command]
fn clear_log(project_id: String) -> Result<(), String> {
    core::clear_project_log(&project_id)
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
async fn stage_git_files(project_id: String, paths: Vec<String>) -> Result<GitWorkspace, String> {
    run_blocking(move || core::stage_git_paths(&project_id, &paths)).await
}

#[tauri::command]
async fn unstage_git_files(project_id: String, paths: Vec<String>) -> Result<GitWorkspace, String> {
    run_blocking(move || core::unstage_git_paths(&project_id, &paths)).await
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
async fn switch_branch(project_id: String, branch: String) -> Result<GitWorkspace, String> {
    run_blocking(move || core::switch_git_branch(&project_id, &branch)).await
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
            detect_project,
            launch_project,
            halt_project,
            read_project_log,
            clear_log,
            show_in_folder,
            show_in_terminal,
            get_git_workspace,
            get_git_diff,
            stage_git_files,
            unstage_git_files,
            create_commit,
            get_commit_message_providers,
            open_local_ai_setup,
            generate_commit_message,
            create_branch,
            switch_branch,
            fetch_repository,
            pull_repository,
            push_repository,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Runbox");
}
