use clap::{Parser, Subcommand};
use owo_colors::OwoColorize;
use runbox_lib::core::{self, GitStatus, ProcessStatus, Project};
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

    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// Show all configured projects
    List,
    /// Start a project
    Start { project: String },
    /// Stop a project
    Stop { project: String },
    /// Print recent project output
    Logs {
        project: String,
        /// Keep watching for new output
        #[arg(short, long)]
        follow: bool,
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
    match (cli.project, cli.command) {
        (Some(project), None) => start(&project),
        (None, None | Some(Commands::List)) => list(),
        (None, Some(Commands::Start { project })) => start(&project),
        (None, Some(Commands::Stop { project })) => stop(&project),
        (None, Some(Commands::Logs { project, follow })) => logs(&project, follow),
        (
            None,
            Some(Commands::Add {
                path,
                name,
                command,
            }),
        ) => add(&path, name, command),
        (None, Some(Commands::Remove { project })) => remove(&project),
        (None, Some(Commands::DataDir)) => {
            println!("{}", core::data_directory()?.display());
            Ok(())
        }
        (Some(_), Some(_)) => {
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
            ("●".green().to_string(), "running".green().to_string())
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
            project.project.command.dimmed()
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

fn start(query: &str) -> Result<(), String> {
    let project = core::find_project(query)?;
    let view = core::start_project(&project.id)?;
    println!(
        "{} {}  {}",
        "●".green(),
        view.project.name.bold(),
        format!("pid {}", view.pid.unwrap_or_default()).dimmed()
    );
    println!("  {} {}", "$".green(), view.project.command);
    println!(
        "  {}",
        format!("p logs {} -f", shell_word(&view.project.name)).dimmed()
    );
    Ok(())
}

fn stop(query: &str) -> Result<(), String> {
    let project = core::find_project(query)?;
    core::stop_project(&project.id)?;
    println!("{} {} stopped", "○".yellow(), project.name.bold());
    Ok(())
}

fn logs(query: &str, follow: bool) -> Result<(), String> {
    let project = core::find_project(query)?;
    let mut previous = String::new();
    loop {
        let output = core::project_log(&project.id, 200)?;
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

fn add(path: &str, name: Option<String>, command: Option<String>) -> Result<(), String> {
    let draft = core::inspect_project(path)?;
    let updating = core::list_projects()?
        .iter()
        .any(|project| project.path == draft.path);
    let project = core::upsert_project(Project {
        id: String::new(),
        name: name.unwrap_or(draft.name),
        path: draft.path,
        command: command.unwrap_or(draft.command),
        favorite: false,
        sort_order: 0,
    })?;
    let action = if updating { "updated" } else { "added" };
    println!("{} {} {action}", "+".green().bold(), project.name.bold());
    println!("  {} {}", "$".green(), project.command);
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
