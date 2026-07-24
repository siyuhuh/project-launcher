pub mod core;

use core::{Project, ProjectDraft, ProjectView};

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running Runbox");
}
