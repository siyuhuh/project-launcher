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

type Translate = (key: string, values?: Record<string, string | number>) => string;

export function projectActivity(project: ProjectView, t: Translate = (key) => key): string {
  if (project.status === "running") {
    const taskLabel =
      project.taskCount > 1
        ? t("{{running}}/{{total}} tasks · ", {
            running: project.runningTaskCount,
            total: project.taskCount,
          })
        : "";
    return `${taskLabel}${t("Running for {{time}}", { time: elapsedTime(project.startedAt, t) })}`;
  }
  if (project.crashedTaskCount > 0) {
    return project.crashedTaskCount === 1
      ? t("{{count}} task crashed", { count: project.crashedTaskCount })
      : t("{{count}} tasks crashed", { count: project.crashedTaskCount });
  }
  if (project.taskCount === 0) {
    return t("No automation");
  }
  if (project.startedAt) {
    return t("Opened {{time}}", { time: relativeTime(project.startedAt, t) });
  }
  return t("Not opened yet");
}

function relativeTime(timestamp: number, t: Translate): string {
  const elapsed = Math.max(0, Math.floor(Date.now() / 1_000) - timestamp);
  if (elapsed < 60) return t("just now");
  if (elapsed < 3_600) return t("{{count}}m ago", { count: Math.floor(elapsed / 60) });
  if (elapsed < 86_400) return t("{{count}}h ago", { count: Math.floor(elapsed / 3_600) });
  if (elapsed < 604_800) return t("{{count}}d ago", { count: Math.floor(elapsed / 86_400) });
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
    timestamp * 1_000,
  );
}

function elapsedTime(timestamp: number | null, t: Translate): string {
  if (!timestamp) return t("a moment");
  const elapsed = Math.max(0, Math.floor(Date.now() / 1_000) - timestamp);
  if (elapsed < 60) return t("{{count}}s", { count: elapsed });
  if (elapsed < 3_600) return t("{{count}}m", { count: Math.floor(elapsed / 60) });
  return t("{{hours}}h {{minutes}}m", {
    hours: Math.floor(elapsed / 3_600),
    minutes: Math.floor((elapsed % 3_600) / 60),
  });
}
