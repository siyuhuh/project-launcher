import type { ProjectView } from "../types";

export type CommandTag = "pnpm" | "npm" | "bun" | "docker" | "rust" | "python" | "other";

export function commandTag(command: string): CommandTag {
  const normalized = command.trim().toLowerCase();
  if (normalized.startsWith("pnpm")) return "pnpm";
  if (normalized.startsWith("npm")) return "npm";
  if (normalized.startsWith("bun")) return "bun";
  if (normalized.includes("docker compose")) return "docker";
  if (normalized.startsWith("cargo")) return "rust";
  if (normalized.startsWith("python")) return "python";
  return "other";
}

export function projectActivity(project: ProjectView): string {
  if (project.status === "running") {
    const taskLabel =
      project.taskCount > 1 ? `${project.runningTaskCount}/${project.taskCount} tasks · ` : "";
    return `${taskLabel}Running for ${elapsedTime(project.startedAt)}`;
  }
  if (project.crashedTaskCount > 0) {
    return `${project.crashedTaskCount} task${project.crashedTaskCount === 1 ? "" : "s"} crashed`;
  }
  if (project.startedAt) {
    return `Opened ${relativeTime(project.startedAt)}`;
  }
  return "Not opened yet";
}

function relativeTime(timestamp: number): string {
  const elapsed = Math.max(0, Math.floor(Date.now() / 1_000) - timestamp);
  if (elapsed < 60) return "just now";
  if (elapsed < 3_600) return `${Math.floor(elapsed / 60)}m ago`;
  if (elapsed < 86_400) return `${Math.floor(elapsed / 3_600)}h ago`;
  if (elapsed < 604_800) return `${Math.floor(elapsed / 86_400)}d ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
    timestamp * 1_000,
  );
}

function elapsedTime(timestamp: number | null): string {
  if (!timestamp) return "a moment";
  const elapsed = Math.max(0, Math.floor(Date.now() / 1_000) - timestamp);
  if (elapsed < 60) return `${elapsed}s`;
  if (elapsed < 3_600) return `${Math.floor(elapsed / 60)}m`;
  return `${Math.floor(elapsed / 3_600)}h ${Math.floor((elapsed % 3_600) / 60)}m`;
}
