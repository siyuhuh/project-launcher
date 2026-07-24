use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Mutex, OnceLock, mpsc},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
#[cfg(target_os = "macos")]
use std::{ffi::CString, os::unix::ffi::OsStrExt, ptr};
use uuid::Uuid;

const APP_DIRECTORY: &str = "Runbox";
const LOG_READ_LIMIT: u64 = 256 * 1024;
const FINDER_TAG_CACHE_TTL: Duration = Duration::from_secs(15);

#[derive(Default)]
struct FinderTagCache {
    entries: HashMap<String, (Instant, Option<String>)>,
    pending: HashSet<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub command: String,
    #[serde(default)]
    pub favorite: bool,
    #[serde(default)]
    pub sort_order: i64,
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
    pub finder_tag_color: Option<String>,
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

    let mut projects: Vec<Project> = serde_json::from_str(&raw).map_err(display_error)?;
    let needs_order_migration =
        projects.len() > 1 && projects.iter().all(|project| project.sort_order == 0);
    let mut changed = false;

    for (index, project) in projects.iter_mut().enumerate() {
        if needs_order_migration {
            project.sort_order = index as i64 * 100;
            changed = true;
        }
    }

    if changed {
        write_projects(&projects)?;
    }
    Ok(projects)
}

pub fn list_project_views() -> Result<Vec<ProjectView>, String> {
    let mut projects = list_projects()?;
    projects.sort_by(|left, right| {
        right
            .favorite
            .cmp(&left.favorite)
            .then_with(|| left.sort_order.cmp(&right.sort_order))
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
            let finder_tag_color = finder_tag_color(&project.path);

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
                finder_tag_color,
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
        if let Some(existing) = projects.iter().find(|item| item.path == project.path) {
            project.id = existing.id.clone();
            project.favorite = existing.favorite;
            project.sort_order = existing.sort_order;
        } else {
            project.id = Uuid::new_v4().to_string();
            project.sort_order = projects
                .iter()
                .map(|item| item.sort_order)
                .max()
                .unwrap_or(-100)
                + 100;
        }
    }
    if let Some(existing) = projects.iter_mut().find(|item| item.id == project.id) {
        *existing = project.clone();
    } else {
        projects.push(project.clone());
    }
    write_projects(&projects)?;
    Ok(project)
}

pub fn set_project_favorite(project_id: &str, favorite: bool) -> Result<Project, String> {
    let mut projects = list_projects()?;
    let project = projects
        .iter_mut()
        .find(|project| project.id == project_id)
        .ok_or_else(|| "Project not found".to_string())?;
    project.favorite = favorite;
    let updated = project.clone();
    write_projects(&projects)?;
    Ok(updated)
}

pub fn reorder_projects(project_ids: &[String]) -> Result<(), String> {
    let positions: HashMap<&str, i64> = project_ids
        .iter()
        .enumerate()
        .map(|(index, id)| (id.as_str(), index as i64 * 100))
        .collect();
    let mut projects = list_projects()?;

    for project in &mut projects {
        if let Some(position) = positions.get(project.id.as_str()) {
            project.sort_order = *position;
        }
    }
    write_projects(&projects)
}

pub fn refresh_finder_tags() -> Result<(), String> {
    let paths: Vec<String> = list_projects()?
        .into_iter()
        .map(|project| project.path)
        .collect();
    thread::spawn(move || {
        for path in paths {
            let color = read_finder_tag_color(&path);
            if let Ok(mut cache) = finder_tag_cache().lock() {
                cache.entries.insert(path.clone(), (Instant::now(), color));
                cache.pending.remove(&path);
            }
        }
    });
    Ok(())
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
    let finder_tag_color = finder_tag_color(&project.path);
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
        finder_tag_color,
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
    let finder_tag_color = finder_tag_color(&project.path);

    Ok(ProjectView {
        project,
        status: ProcessStatus::Stopped,
        pid: None,
        started_at: runtime.started_at,
        stopped_at: runtime.stopped_at,
        finder_tag_color,
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

fn finder_tag_color(path: &str) -> Option<String> {
    let (cached_color, should_refresh) = {
        let mut cache = finder_tag_cache().lock().ok()?;
        if let Some((checked_at, color)) = cache.entries.get(path) {
            if checked_at.elapsed() < FINDER_TAG_CACHE_TTL {
                return color.clone();
            }
        }
        let cached_color = cache.entries.get(path).and_then(|(_, color)| color.clone());
        let should_refresh = cache.pending.insert(path.to_string());
        (cached_color, should_refresh)
    };

    if should_refresh {
        let _ = finder_tag_sender().send(path.to_string());
    }
    cached_color
}

fn finder_tag_cache() -> &'static Mutex<FinderTagCache> {
    static CACHE: OnceLock<Mutex<FinderTagCache>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(FinderTagCache::default()))
}

fn finder_tag_sender() -> &'static mpsc::Sender<String> {
    static SENDER: OnceLock<mpsc::Sender<String>> = OnceLock::new();
    SENDER.get_or_init(|| {
        let (sender, receiver) = mpsc::channel::<String>();
        thread::spawn(move || {
            for path in receiver {
                let color = read_finder_tag_color(&path);
                if let Ok(mut cache) = finder_tag_cache().lock() {
                    cache.entries.insert(path.clone(), (Instant::now(), color));
                    cache.pending.remove(&path);
                }
            }
        });
        sender
    })
}

#[cfg(target_os = "macos")]
fn read_finder_tag_color(path: &str) -> Option<String> {
    let path = CString::new(Path::new(path).as_os_str().as_bytes()).ok()?;
    let attribute = c"com.apple.metadata:_kMDItemUserTags";
    let size =
        unsafe { libc::getxattr(path.as_ptr(), attribute.as_ptr(), ptr::null_mut(), 0, 0, 0) };
    if size <= 0 {
        return None;
    }

    let mut bytes = vec![0_u8; size as usize];
    let bytes_read = unsafe {
        libc::getxattr(
            path.as_ptr(),
            attribute.as_ptr(),
            bytes.as_mut_ptr().cast(),
            bytes.len(),
            0,
            0,
        )
    };
    if bytes_read <= 0 {
        return None;
    }
    bytes.truncate(bytes_read as usize);

    let color = bytes.windows(4).find_map(|window| match window {
        [0, b'\n', 0, b'1'] => Some("gray"),
        [0, b'\n', 0, b'2'] => Some("green"),
        [0, b'\n', 0, b'3'] => Some("purple"),
        [0, b'\n', 0, b'4'] => Some("blue"),
        [0, b'\n', 0, b'5'] => Some("yellow"),
        [0, b'\n', 0, b'6'] => Some("red"),
        [0, b'\n', 0, b'7'] => Some("orange"),
        _ => None,
    })?;
    Some(color.to_string())
}

#[cfg(not(target_os = "macos"))]
fn read_finder_tag_color(_path: &str) -> Option<String> {
    None
}

fn display_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}
