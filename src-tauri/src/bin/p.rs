use clap::{Parser, Subcommand};
use owo_colors::OwoColorize;
use runbox_lib::core::{
    self, GitStatus, ProcessStatus, Project, ProjectTask, TaskLifecycleState, TaskReadinessKind,
};
use std::{thread, time::Duration};

#[derive(Parser)]
#[command(
    name = "p",
    version,
    about = "Runbox — launch local projects without remembering commands",
    subcommand_negates_reqs = true
)]
struct Cli {
    /// Start a project by name. Example: p my-web
    project: Option<String>,
    /// Start a specific task. Example: p my-web api
    task: Option<String>,

    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// Show all configured projects
    List,
    /// Start a project
    Start {
        project: String,
        task: Option<String>,
    },
    /// Stop a project
    Stop {
        project: String,
        task: Option<String>,
    },
    /// Print recent project output
    Logs {
        project: String,
        task: Option<String>,
        /// Keep watching for new output
        #[arg(short, long)]
        follow: bool,
    },
    /// Show the configured tasks and health for a project
    Tasks { project: String },
    /// Show configured workspace groups
    Workspaces,
    /// Start or stop a workspace group
    Workspace {
        workspace: String,
        /// Stop the workspace instead of starting it
        #[arg(long)]
        stop: bool,
    },
    /// Add a project from a local directory
    Add {
        path: String,
        #[arg(short, long)]
        name: Option<String>,
        #[arg(short, long)]
        command: Option<String>,
    },
    /// Remove a stopped project
    Remove { project: String },
    /// Print the shared Runbox data directory
    DataDir,
}

fn main() {
    if let Err(error) = execute(Cli::parse()) {
        eprintln!("{} {error}", "error:".red().bold());
        std::process::exit(1);
    }
}

fn execute(cli: Cli) -> Result<(), String> {
    match (cli.project, cli.task, cli.command) {
        (Some(project), task, None) => start(&project, task.as_deref()),
        (None, None, None | Some(Commands::List)) => list(),
        (None, None, Some(Commands::Start { project, task })) => start(&project, task.as_deref()),
        (None, None, Some(Commands::Stop { project, task })) => stop(&project, task.as_deref()),
        (
            None,
            None,
            Some(Commands::Logs {
                project,
                task,
                follow,
            }),
        ) => logs(&project, task.as_deref(), follow),
        (None, None, Some(Commands::Tasks { project })) => tasks(&project),
        (None, None, Some(Commands::Workspaces)) => workspaces(),
        (
            None,
            None,
            Some(Commands::Workspace {
                workspace: group_query,
                stop,
            }),
        ) => workspace(&group_query, stop),
        (
            None,
            None,
            Some(Commands::Add {
                path,
                name,
                command,
            }),
        ) => add(&path, name, command),
        (None, None, Some(Commands::Remove { project })) => remove(&project),
        (None, None, Some(Commands::DataDir)) => {
            println!("{}", core::data_directory()?.display());
            Ok(())
        }
        (Some(_), _, Some(_)) | (None, Some(_), _) => {
            Err("Use either a project name or a subcommand, not both".to_string())
        }
    }
}

fn list() -> Result<(), String> {
    let projects = core::list_project_views()?;
    if projects.is_empty() {
        println!(
            "{}\nAdd projects in the Runbox app or run: p add <path>",
            "No projects yet.".dimmed()
        );
        return Ok(());
    }

    println!(
        "{:<3}  {:<24}  {:<10}  {:<22}  {}",
        "",
        "PROJECT".dimmed(),
        "STATUS".dimmed(),
        "GIT".dimmed(),
        "COMMAND".dimmed()
    );
    for project in projects {
        let (dot, status) = if project.status == ProcessStatus::Running {
            (
                "●".green().to_string(),
                format!(
                    "{}/{} running",
                    project.running_task_count, project.task_count
                )
                .green()
                .to_string(),
            )
        } else {
            ("○".dimmed().to_string(), "stopped".dimmed().to_string())
        };
        let git_status = project
            .git_status
            .clone()
            .or_else(|| core::read_git_status_sync(&project.project.path));
        println!(
            "{:<3}  {:<24}  {:<10}  {:<22}  {}",
            if project.project.favorite {
                "★".yellow().to_string()
            } else {
                dot
            },
            truncate(&project.project.name, 24),
            status,
            git_summary(git_status.as_ref()),
            if project.project.command.is_empty() {
                "—".dimmed().to_string()
            } else {
                project.project.command.dimmed().to_string()
            }
        );
    }
    Ok(())
}

fn git_summary(status: Option<&GitStatus>) -> String {
    let Some(status) = status else {
        return "—".dimmed().to_string();
    };
    if !status.is_repo {
        return "—".dimmed().to_string();
    }

    let mut label = status.branch.clone();
    if status.dirty {
        label.push_str(&format!(" · {} changed", status.changed));
    } else {
        label.push_str(" · clean");
    }
    if status.ahead > 0 {
        label.push_str(&format!(" ↑{}", status.ahead));
    }
    if status.behind > 0 {
        label.push_str(&format!(" ↓{}", status.behind));
    }

    let label = truncate(&label, 22);
    if status.dirty {
        label.yellow().to_string()
    } else {
        label.green().to_string()
    }
}

fn start(query: &str, task_query: Option<&str>) -> Result<(), String> {
    let project = core::find_project(query)?;
    if let Some(task_query) = task_query {
        let view = core::start_project_task(&project.id, task_query)?;
        println!(
            "{} {} / {}  {} · {}",
            "●".green(),
            project.name.bold(),
            view.task.name.bold(),
            task_state(&view.state),
            format!("pid {}", view.pid.unwrap_or_default()).dimmed()
        );
        println!("  {} {}", "$".green(), view.task.command);
        return Ok(());
    }
    let view = core::start_project(&project.id)?;
    println!(
        "{} {}  {}",
        "●".green(),
        view.project.name.bold(),
        format!(
            "{} of {} tasks running",
            view.running_task_count, view.task_count
        )
        .dimmed()
    );
    for task in view.project.tasks.iter().filter(|task| task.auto_start) {
        println!("  {} {:<12} {}", "$".green(), task.name, task.command);
    }
    println!(
        "  {}",
        format!("p logs {} -f", shell_word(&view.project.name)).dimmed()
    );
    Ok(())
}

fn stop(query: &str, task_query: Option<&str>) -> Result<(), String> {
    let project = core::find_project(query)?;
    if let Some(task_query) = task_query {
        let task = core::find_project_task(&project, task_query)?;
        core::stop_project_task(&project.id, &task.id)?;
        println!(
            "{} {} / {} stopped",
            "○".yellow(),
            project.name.bold(),
            task.name.bold()
        );
    } else {
        core::stop_project(&project.id)?;
        println!("{} {} stopped", "○".yellow(), project.name.bold());
    }
    Ok(())
}

fn logs(query: &str, task_query: Option<&str>, follow: bool) -> Result<(), String> {
    let project = core::find_project(query)?;
    let task = task_query
        .map(|query| core::find_project_task(&project, query))
        .transpose()?;
    let mut previous = String::new();
    loop {
        let output = if let Some(task) = task.as_ref() {
            core::project_task_log(&project.id, &task.id, 200)?
        } else {
            core::project_log(&project.id, 200)?
        };
        if output != previous {
            if previous.is_empty() {
                println!("{output}");
            } else if let Some(new_output) = output.strip_prefix(&previous) {
                print!("{new_output}");
            } else {
                print!("\x1b[2J\x1b[H{output}");
            }
            previous = output;
        }
        if !follow {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(600));
    }
}

fn tasks(query: &str) -> Result<(), String> {
    let project = core::find_project(query)?;
    println!("{}  {}", project.name.bold(), project.path.dimmed());
    for task in core::project_tasks(&project.id)? {
        let (dot, state) = task_state_columns(&task.state);
        let health = if task.status == ProcessStatus::Running {
            format!(
                "{:.1}% CPU · {:.0} MB",
                task.cpu_percent,
                task.memory_bytes as f64 / 1_048_576.0
            )
        } else {
            task.exit_code
                .map(|code| format!("exit {code}"))
                .unwrap_or_default()
        };
        println!(
            "{} {:<16} {:<9} {:<22} {}",
            dot,
            truncate(&task.task.name, 16),
            state,
            health.dimmed(),
            task.task.command.dimmed()
        );
        for port in task.ports {
            println!("    {} {}", "↗".green(), port.url);
        }
        let readiness = readiness_summary(&task.task);
        let dependencies = task
            .task
            .depends_on
            .iter()
            .filter_map(|id| project.tasks.iter().find(|candidate| candidate.id == *id))
            .map(|dependency| dependency.name.as_str())
            .collect::<Vec<_>>();
        println!(
            "    {} {}{}",
            "✓".green(),
            readiness.dimmed(),
            if dependencies.is_empty() {
                String::new()
            } else {
                format!(" · after {}", dependencies.join(", "))
                    .dimmed()
                    .to_string()
            }
        );
        if let Some(conflict) = task.port_conflict {
            println!(
                "    {} port {} used by {} (pid {})",
                "!".red().bold(),
                conflict.port,
                conflict.process_name,
                conflict.pid
            );
        } else if let Some(error) = task.last_error {
            println!("    {} {}", "!".red().bold(), error);
        }
    }
    Ok(())
}

fn workspaces() -> Result<(), String> {
    let groups = core::list_workspace_groups()?;
    if groups.is_empty() {
        println!("{}", "No workspace groups yet.".dimmed());
        return Ok(());
    }
    for group in groups {
        let mut state = format!("{}/{} ready", group.ready_task_count, group.tasks.len());
        if group.blocked_task_count > 0 {
            state.push_str(&format!(" · {} blocked", group.blocked_task_count));
        }
        println!(
            "{} {:<24} {}",
            if group.running_task_count > 0 {
                "●".green().to_string()
            } else {
                "○".dimmed().to_string()
            },
            group.group.name.bold(),
            state.dimmed()
        );
    }
    Ok(())
}

fn workspace(query: &str, stop: bool) -> Result<(), String> {
    let group = if stop {
        core::stop_workspace_group(query)?
    } else {
        core::start_workspace_group(query)?
    };
    println!(
        "{} {}  {}/{} ready{}",
        if stop {
            "○".yellow().to_string()
        } else {
            "●".green().to_string()
        },
        group.group.name.bold(),
        group.ready_task_count,
        group.tasks.len(),
        if group.blocked_task_count > 0 {
            format!(" · {} blocked", group.blocked_task_count)
        } else {
            String::new()
        }
    );
    Ok(())
}

fn add(path: &str, name: Option<String>, command: Option<String>) -> Result<(), String> {
    let draft = core::inspect_project(path)?;
    let updating = core::list_projects()?
        .iter()
        .any(|project| project.path == draft.path);
    let mut tasks = draft.tasks;
    if let Some(command) = command.as_ref() {
        if let Some(primary) = tasks.first_mut() {
            primary.command = command.clone();
        } else if !command.trim().is_empty() {
            tasks.push(ProjectTask {
                id: "default".to_string(),
                name: "Dev".to_string(),
                command: command.clone(),
                auto_start: true,
                depends_on: Vec::new(),
                readiness: Default::default(),
            });
        }
    }
    let project = core::upsert_project(Project {
        id: String::new(),
        name: name.unwrap_or(draft.name),
        path: draft.path,
        command: command.unwrap_or(draft.command),
        tasks,
        tags: draft.tags,
        favorite: false,
        sort_order: 0,
    })?;
    let action = if updating { "updated" } else { "added" };
    println!("{} {} {action}", "+".green().bold(), project.name.bold());
    if project.command.is_empty() {
        println!("  {}", "no automation tasks".dimmed());
    } else {
        println!("  {} {}", "$".green(), project.command);
    }
    Ok(())
}

fn remove(query: &str) -> Result<(), String> {
    let project = core::find_project(query)?;
    core::delete_project(&project.id)?;
    println!("{} {} removed", "−".yellow().bold(), project.name.bold());
    Ok(())
}

fn truncate(value: &str, width: usize) -> String {
    if value.chars().count() <= width {
        return value.to_string();
    }
    let mut result: String = value.chars().take(width.saturating_sub(1)).collect();
    result.push('…');
    result
}

fn shell_word(value: &str) -> String {
    if value.contains(char::is_whitespace) {
        format!("'{}'", value.replace('\'', "'\\''"))
    } else {
        value.to_string()
    }
}

fn task_state_columns(state: &TaskLifecycleState) -> (String, String) {
    match state {
        TaskLifecycleState::Ready | TaskLifecycleState::Running => (
            "●".green().to_string(),
            task_state(state).green().to_string(),
        ),
        TaskLifecycleState::Waiting | TaskLifecycleState::Starting => (
            "◐".yellow().to_string(),
            task_state(state).yellow().to_string(),
        ),
        TaskLifecycleState::Blocked | TaskLifecycleState::Crashed => (
            "!".red().bold().to_string(),
            task_state(state).red().to_string(),
        ),
        TaskLifecycleState::Exited => (
            "○".yellow().to_string(),
            task_state(state).yellow().to_string(),
        ),
        TaskLifecycleState::Stopped => (
            "○".dimmed().to_string(),
            task_state(state).dimmed().to_string(),
        ),
    }
}

fn task_state(state: &TaskLifecycleState) -> &'static str {
    match state {
        TaskLifecycleState::Stopped => "stopped",
        TaskLifecycleState::Waiting => "waiting",
        TaskLifecycleState::Starting => "starting",
        TaskLifecycleState::Running => "running",
        TaskLifecycleState::Ready => "ready",
        TaskLifecycleState::Exited => "exited",
        TaskLifecycleState::Crashed => "crashed",
        TaskLifecycleState::Blocked => "blocked",
    }
}

fn readiness_summary(task: &ProjectTask) -> String {
    let condition = match task.readiness.kind {
        TaskReadinessKind::Process => "process stays alive".to_string(),
        TaskReadinessKind::Port => format!("port {} listens", task.readiness.value),
        TaskReadinessKind::Http => format!("{} responds", task.readiness.value),
        TaskReadinessKind::Log => format!("log contains {:?}", task.readiness.value),
    };
    format!(
        "ready when {condition} · timeout {}s",
        task.readiness.timeout_seconds
    )
}
