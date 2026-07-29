import { getCurrentWebview } from "@tauri-apps/api/webview";

export type ThemeId = "runbox" | "graphite" | "spool" | "solarized";

export interface AppPreferences {
  version: 1;
  scale: number;
  theme: ThemeId;
}

export interface ThemeOption {
  id: ThemeId;
  name: string;
  detail: string;
  swatches: [string, string, string];
}

export const MIN_UI_SCALE = 0.8;
export const MAX_UI_SCALE = 1.6;
export const UI_SCALE_STEP = 0.05;
export const UI_SCALE_PRESETS = [0.9, 1, 1.1, 1.25, 1.4, 1.6] as const;

export const DEFAULT_PREFERENCES: AppPreferences = {
  version: 1,
  scale: 1.25,
  theme: "runbox",
};

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "runbox",
    name: "Runbox",
    detail: "Deep black with terminal green",
    swatches: ["#0a0c0b", "#151a16", "#9bea78"],
  },
  {
    id: "graphite",
    name: "Graphite",
    detail: "Neutral charcoal with soft mint",
    swatches: ["#101112", "#202224", "#a7d8c7"],
  },
  {
    id: "spool",
    name: "Spool",
    detail: "Warm ink with golden amber",
    swatches: ["#11100e", "#211e19", "#e8b96d"],
  },
  {
    id: "solarized",
    name: "Solarized",
    detail: "Blue-black with calm cyan",
    swatches: ["#001e26", "#07313b", "#52c7b8"],
  },
];

const STORAGE_KEY = "runbox.preferences.v1";
const THEME_IDS = new Set<ThemeId>(THEME_OPTIONS.map((theme) => theme.id));

export function loadPreferences(): AppPreferences {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(stored) as Partial<AppPreferences>;
    const scale =
      typeof parsed.scale === "number" && Number.isFinite(parsed.scale)
        ? parsed.scale
        : DEFAULT_PREFERENCES.scale;
    return {
      version: 1,
      scale: clampUiScale(scale),
      theme:
        typeof parsed.theme === "string" && THEME_IDS.has(parsed.theme as ThemeId)
          ? (parsed.theme as ThemeId)
          : DEFAULT_PREFERENCES.theme,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(preferences: AppPreferences): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}

export async function applyPreferences(preferences: AppPreferences): Promise<void> {
  document.documentElement.dataset.theme = preferences.theme;
  document.documentElement.style.colorScheme = "dark";

  if ("__TAURI_INTERNALS__" in window) {
    document.body.style.removeProperty("zoom");
    await getCurrentWebview().setZoom(preferences.scale);
    return;
  }

  document.body.style.zoom = String(preferences.scale);
}

export function updateUiScale(
  preferences: AppPreferences,
  scale: number,
): AppPreferences {
  return {
    ...preferences,
    scale: clampUiScale(scale),
  };
}

export function clampUiScale(scale: number): number {
  const rounded = Math.round(scale / UI_SCALE_STEP) * UI_SCALE_STEP;
  return Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, rounded));
}

export function formatUiScale(scale: number): string {
  return `${Math.round(scale * 100)}%`;
}
