use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

const APP_DIRECTORY: &str = "Runbox";
const LOG_READ_LIMIT: u64 = 256 * 1024;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub command: String,
    #[serde(default)]
    pub favorite: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectView {
    #[serde(flatten)]
    pub project: Project,
    pub status: ProcessStatus,
    pub pid: Option<u32>,
    pub started_at: Option<u64>,
    pub stopped_at: Option<u64>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ProcessStatus {
    Running,
    Stopped,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDraft {
    pub name: String,
    pub path: String,
    pub command: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct RuntimeInfo {
    pid: Option<u32>,
    started_at: Option<u64>,
    stopped_at: Option<u64>,
}

pub fn data_directory() -> Result<PathBuf, String> {
    let base = dirs::config_dir()
        .ok_or_else(|| "Could not locate the user config directory".to_string())?;
    let directory = base.join(APP_DIRECTORY);
    fs::create_dir_all(directory.join("logs")).map_err(display_error)?;
    fs::create_dir_all(directory.join("runtime")).map_err(display_error)?;
    Ok(directory)
}

fn projects_file() -> Result<PathBuf, String> {
    Ok(data_directory()?.join("projects.json"))
}

fn runtime_file(project_id: &str) -> Result<PathBuf, String> {
    Ok(data_directory()?
        .join("runtime")
        .join(format!("{project_id}.json")))
}

fn log_file(project_id: &str) -> Result<PathBuf, String> {
    Ok(data_directory()?
        .join("logs")
        .join(format!("{project_id}.log")))
}

pub fn list_projects() -> Result<Vec<Project>, String> {
    let path = projects_file()?;
    if !path.exists() {
        return Ok(Vec::new());
    }

    let raw = fs::read_to_string(path).map_err(display_error)?;
    if raw.trim().is_empty() {
        return Ok(Vec::new());
    }

    serde_json::from_str(&raw).map_err(display_error)
}

pub fn list_project_views() -> Result<Vec<ProjectView>, String> {
    let mut projects = list_projects()?;
    projects.sort_by(|left, right| {
        right
            .favorite
            .cmp(&left.favorite)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    projects
        .into_iter()
        .map(|project| {
            let mut runtime = read_runtime(&project.id)?;
            let running = runtime.pid.is_some_and(process_is_running);

            if runtime.pid.is_some() && !running {
                runtime.pid = None;
                runtime.stopped_at = Some(now());
                write_runtime(&project.id, &runtime)?;
            }

            Ok(ProjectView {
                project,
                status: if running {
                    ProcessStatus::Running
                } else {
                    ProcessStatus::Stopped
                },
                pid: runtime.pid,
                started_at: runtime.started_at,
                stopped_at: runtime.stopped_at,
            })
        })
        .collect()
}

pub fn upsert_project(mut project: Project) -> Result<Project, String> {
    project.name = project.name.trim().to_string();
    project.command = project.command.trim().to_string();
    project.path = normalize_path(&project.path)?;

    if project.name.is_empty() {
        return Err("Project name is required".to_string());
    }
    if project.command.is_empty() {
        return Err("Start command is required".to_string());
    }
    if !Path::new(&project.path).is_dir() {
        return Err(format!(
            "Project directory does not exist: {}",
            project.path
        ));
    }

    let mut projects = list_projects()?;
    if project.id.trim().is_empty() {
        project.id = projects
            .iter()
            .find(|item| item.path == project.path)
            .map(|item| item.id.clone())
            .unwrap_or_else(|| Uuid::new_v4().to_string());
    }
    if let Some(existing) = projects.iter_mut().find(|item| item.id == project.id) {
        *existing = project.clone();
    } else {
        projects.push(project.clone());
    }
    write_projects(&projects)?;
    Ok(project)
}

pub fn delete_project(project_id: &str) -> Result<(), String> {
    if project_status(project_id)? == ProcessStatus::Running {
        return Err("Stop the project before removing it".to_string());
    }

    let mut projects = list_projects()?;
    let original_len = projects.len();
    projects.retain(|project| project.id != project_id);
    if projects.len() == original_len {
        return Err("Project not found".to_string());
    }
    write_projects(&projects)?;
    let _ = fs::remove_file(runtime_file(project_id)?);
    let _ = fs::remove_file(log_file(project_id)?);
    Ok(())
}

pub fn inspect_project(path: &str) -> Result<ProjectDraft, String> {
    let normalized = normalize_path(path)?;
    let directory = Path::new(&normalized);
    if !directory.is_dir() {
        return Err(format!("Project directory does not exist: {normalized}"));
    }

    let fallback_name = directory
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Untitled project")
        .to_string();

    let package_path = directory.join("package.json");
    if package_path.exists() {
        let package: Value =
            serde_json::from_str(&fs::read_to_string(package_path).map_err(display_error)?)
                .map_err(display_error)?;
        let name = package
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or(&fallback_name)
            .to_string();
        let scripts = package.get("scripts").and_then(Value::as_object);
        let script = ["dev", "start", "serve"]
            .into_iter()
            .find(|candidate| scripts.is_some_and(|items| items.contains_key(*candidate)));

        let package_manager = if directory.join("pnpm-lock.yaml").exists() {
            "pnpm"
        } else if directory.join("bun.lock").exists() || directory.join("bun.lockb").exists() {
            "bun"
        } else if directory.join("yarn.lock").exists() {
            "yarn"
        } else {
            "npm"
        };

        let command = match (package_manager, script) {
            ("pnpm", Some(script)) => format!("pnpm run {script}"),
            ("bun", Some(script)) => format!("bun run {script}"),
            ("yarn", Some(script)) => format!("yarn {script}"),
            ("npm", Some(script)) => format!("npm run {script}"),
            _ => "pnpm run dev".to_string(),
        };

        return Ok(ProjectDraft {
            name,
            path: normalized,
            command,
        });
    }

    let command = if directory.join("justfile").exists() || directory.join("Justfile").exists() {
        "just dev"
    } else if directory.join("docker-compose.yml").exists()
        || directory.join("docker-compose.yaml").exists()
        || directory.join("compose.yml").exists()
        || directory.join("compose.yaml").exists()
    {
        "docker compose up"
    } else if directory.join("Cargo.toml").exists() {
        "cargo run"
    } else if directory.join("pyproject.toml").exists() {
        "python -m main"
    } else {
        ""
    };

    Ok(ProjectDraft {
        name: fallback_name,
        path: normalized,
        command: command.to_string(),
    })
}

pub fn start_project(project_id: &str) -> Result<ProjectView, String> {
    let project = find_project(project_id)?;
    if project_status(&project.id)? == ProcessStatus::Running {
        return Err(format!("{} is already running", project.name));
    }

    let log_path = log_file(&project.id)?;
    let mut log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .map_err(display_error)?;
    writeln!(
        log,
        "\n── {} · {} ──\n$ {}\n",
        project.name,
        chrono::Local::now().format("%Y-%m-%d %H:%M:%S"),
        project.command
    )
    .map_err(display_error)?;
    let stderr = log.try_clone().map_err(display_error)?;

    let mut command = shell_command(&project.command);
    command
        .current_dir(&project.path)
        .stdin(Stdio::null())
        .stdout(Stdio::from(log))
        .stderr(Stdio::from(stderr))
        .env("RUNBOX_PROJECT", &project.name)
        .env("TERM", "dumb")
        .env("NO_COLOR", "1");

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }

    let child = command.spawn().map_err(|error| {
        format!(
            "Could not start {} from {}: {error}",
            project.command, project.path
        )
    })?;
    let started_at = now();
    write_runtime(
        &project.id,
        &RuntimeInfo {
            pid: Some(child.id()),
            started_at: Some(started_at),
            stopped_at: None,
        },
    )?;
    drop(child);

    Ok(ProjectView {
        project,
        status: ProcessStatus::Running,
        pid: read_runtime(project_id)?.pid,
        started_at: Some(started_at),
        stopped_at: None,
    })
}

pub fn stop_project(project_id: &str) -> Result<ProjectView, String> {
    let project = find_project(project_id)?;
    let mut runtime = read_runtime(&project.id)?;

    if let Some(pid) = runtime.pid {
        if process_is_running(pid) {
            terminate_process_group(pid)?;
        }
    }

    runtime.pid = None;
    runtime.stopped_at = Some(now());
    write_runtime(&project.id, &runtime)?;

    Ok(ProjectView {
        project,
        status: ProcessStatus::Stopped,
        pid: None,
        started_at: runtime.started_at,
        stopped_at: runtime.stopped_at,
    })
}

pub fn project_log(project_id: &str, max_lines: usize) -> Result<String, String> {
    let path = log_file(project_id)?;
    if !path.exists() {
        return Ok(String::new());
    }

    let mut file = File::open(path).map_err(display_error)?;
    let length = file.metadata().map_err(display_error)?.len();
    if length > LOG_READ_LIMIT {
        file.seek(SeekFrom::End(-(LOG_READ_LIMIT as i64)))
            .map_err(display_error)?;
    }
    let mut contents = String::new();
    file.read_to_string(&mut contents).map_err(display_error)?;
    let lines: Vec<&str> = contents.lines().collect();
    let start = lines.len().saturating_sub(max_lines);
    Ok(lines[start..].join("\n"))
}

pub fn clear_project_log(project_id: &str) -> Result<(), String> {
    File::create(log_file(project_id)?).map_err(display_error)?;
    Ok(())
}

pub fn open_project_directory(project_id: &str) -> Result<(), String> {
    let project = find_project(project_id)?;
    open_path(&project.path)
}

pub fn open_project_terminal(project_id: &str) -> Result<(), String> {
    let project = find_project(project_id)?;

    #[cfg(target_os = "macos")]
    let status = Command::new("open")
        .args(["-a", "Terminal", &project.path])
        .status()
        .map_err(display_error)?;

    #[cfg(target_os = "windows")]
    let status = Command::new("cmd")
        .args(["/C", "start", "cmd", "/K", "cd", "/D", &project.path])
        .status()
        .map_err(display_error)?;

    #[cfg(all(unix, not(target_os = "macos")))]
    let status = Command::new("xdg-open")
        .arg(&project.path)
        .status()
        .map_err(display_error)?;

    if status.success() {
        Ok(())
    } else {
        Err("Could not open a terminal window".to_string())
    }
}

pub fn find_project(query: &str) -> Result<Project, String> {
    let projects = list_projects()?;
    if let Some(project) = projects.iter().find(|item| item.id == query) {
        return Ok(project.clone());
    }

    let query = query.to_lowercase();
    let exact: Vec<_> = projects
        .iter()
        .filter(|item| item.name.to_lowercase() == query)
        .cloned()
        .collect();
    if exact.len() == 1 {
        return Ok(exact[0].clone());
    }

    let matches: Vec<_> = projects
        .into_iter()
        .filter(|item| item.name.to_lowercase().contains(&query))
        .collect();
    match matches.as_slice() {
        [project] => Ok(project.clone()),
        [] => Err(format!("No project matches “{query}”")),
        _ => Err(format!(
            "“{query}” matches multiple projects: {}",
            matches
                .iter()
                .map(|project| project.name.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        )),
    }
}

fn project_status(project_id: &str) -> Result<ProcessStatus, String> {
    let runtime = read_runtime(project_id)?;
    Ok(if runtime.pid.is_some_and(process_is_running) {
        ProcessStatus::Running
    } else {
        ProcessStatus::Stopped
    })
}

fn write_projects(projects: &[Project]) -> Result<(), String> {
    let contents = serde_json::to_string_pretty(projects).map_err(display_error)?;
    atomic_write(&projects_file()?, contents.as_bytes())
}

fn read_runtime(project_id: &str) -> Result<RuntimeInfo, String> {
    let path = runtime_file(project_id)?;
    if !path.exists() {
        return Ok(RuntimeInfo::default());
    }
    let raw = fs::read_to_string(path).map_err(display_error)?;
    serde_json::from_str(&raw).map_err(display_error)
}

fn write_runtime(project_id: &str, runtime: &RuntimeInfo) -> Result<(), String> {
    let contents = serde_json::to_string(runtime).map_err(display_error)?;
    atomic_write(&runtime_file(project_id)?, contents.as_bytes())
}

fn atomic_write(path: &Path, contents: &[u8]) -> Result<(), String> {
    let temporary = path.with_extension("tmp");
    fs::write(&temporary, contents).map_err(display_error)?;
    fs::rename(temporary, path).map_err(display_error)
}

fn normalize_path(path: &str) -> Result<String, String> {
    let trimmed = path.trim();
    let expanded = if trimmed == "~" {
        dirs::home_dir().ok_or_else(|| "Could not locate the home directory".to_string())?
    } else if let Some(relative) = trimmed.strip_prefix("~/") {
        dirs::home_dir()
            .ok_or_else(|| "Could not locate the home directory".to_string())?
            .join(relative)
    } else {
        PathBuf::from(trimmed)
    };

    fs::canonicalize(&expanded)
        .map_err(|_| format!("Project directory does not exist: {}", expanded.display()))?
        .to_str()
        .map(str::to_string)
        .ok_or_else(|| "Project path contains invalid characters".to_string())
}

fn shell_command(command: &str) -> Command {
    #[cfg(windows)]
    {
        let mut shell = Command::new("powershell");
        shell.args(["-NoProfile", "-Command", command]);
        shell
    }

    #[cfg(not(windows))]
    {
        let shell_path = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        let mut shell = Command::new(shell_path);
        let bootstrap = format!(
            "if [ -f \"$HOME/.zshrc\" ]; then source \"$HOME/.zshrc\" >/dev/null 2>&1; fi\n{command}"
        );
        shell.args(["-lc", &bootstrap]);
        shell
    }
}

fn process_is_running(pid: u32) -> bool {
    #[cfg(unix)]
    {
        let result = unsafe { libc::kill(pid as i32, 0) };
        result == 0 || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
    }

    #[cfg(windows)]
    {
        Command::new("tasklist")
            .args(["/FI", &format!("PID eq {pid}"), "/NH"])
            .output()
            .map(|output| String::from_utf8_lossy(&output.stdout).contains(&pid.to_string()))
            .unwrap_or(false)
    }
}

fn terminate_process_group(pid: u32) -> Result<(), String> {
    #[cfg(unix)]
    {
        unsafe {
            libc::kill(-(pid as i32), libc::SIGTERM);
        }
        for _ in 0..25 {
            if !process_is_running(pid) {
                return Ok(());
            }
            thread::sleep(Duration::from_millis(100));
        }
        unsafe {
            libc::kill(-(pid as i32), libc::SIGKILL);
            libc::kill(pid as i32, libc::SIGKILL);
        }
        Ok(())
    }

    #[cfg(windows)]
    {
        let status = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .status()
            .map_err(display_error)?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("Could not stop process {pid}"))
        }
    }
}

fn open_path(path: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let status = Command::new("open")
        .arg(path)
        .status()
        .map_err(display_error)?;

    #[cfg(target_os = "windows")]
    let status = Command::new("explorer")
        .arg(path)
        .status()
        .map_err(display_error)?;

    #[cfg(all(unix, not(target_os = "macos")))]
    let status = Command::new("xdg-open")
        .arg(path)
        .status()
        .map_err(display_error)?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("Could not open {path}"))
    }
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn display_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}
