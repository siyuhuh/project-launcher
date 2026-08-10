import {
  Check,
  Keyboard,
  Languages,
  Minus,
  MonitorCog,
  Palette,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  DEFAULT_PREFERENCES,
  formatUiScale,
  MAX_UI_SCALE,
  MIN_UI_SCALE,
  THEME_OPTIONS,
  UI_SCALE_PRESETS,
  UI_SCALE_STEP,
  updateUiScale,
  type AppPreferences,
} from "../lib/preferences";
import { useI18n } from "../lib/i18n";

type PreferencesSection = "interface" | "appearance";

interface PreferencesPanelProps {
  preferences: AppPreferences;
  onChange: (preferences: AppPreferences) => void;
  onClose: () => void;
}

export function PreferencesPanel({
  preferences,
  onChange,
  onClose,
}: PreferencesPanelProps) {
  const { language, t, toggleLanguage } = useI18n();
  const [section, setSection] = useState<PreferencesSection>("interface");
  const scalePercent = Math.round(preferences.scale * 100);

  function changeScale(scale: number) {
    onChange(updateUiScale(preferences, scale));
  }

  return (
    <div
      className="preferences-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="preferences-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preferences-title"
      >
        <aside className="preferences-sidebar">
          <header>
            <div className="preferences-mark"><SlidersHorizontal size={15} /></div>
            <div>
              <h2 id="preferences-title">{t("Preferences title")}</h2>
              <p>{t("Runbox on this Mac")}</p>
            </div>
          </header>

          <nav aria-label={t("Preference sections")}>
            <PreferenceNavItem
              icon={<MonitorCog size={15} />}
              label={t("Interface")}
              section="interface"
              active={section === "interface"}
              onClick={() => setSection("interface")}
            />
            <PreferenceNavItem
              icon={<Palette size={15} />}
              label={t("Appearance")}
              section="appearance"
              active={section === "appearance"}
              onClick={() => setSection("appearance")}
            />
          </nav>

          <button
            className="preferences-language"
            onClick={toggleLanguage}
            title={t("Switch language")}
            aria-label={t("Switch language")}
          >
            <Languages size={13} />
            <span>{t("Language")}</span>
            <strong>{language === "en" ? t("Chinese") : t("English")}</strong>
          </button>

          <button
            className="preferences-reset"
            onClick={() => onChange(DEFAULT_PREFERENCES)}
          >
            <RotateCcw size={13} />
            {t("Restore defaults")}
          </button>
        </aside>

        <PreferencesContent
          section={section}
          preferences={preferences}
          scalePercent={scalePercent}
          onChange={onChange}
          onScaleChange={changeScale}
        />

        <button
          className="preferences-close"
          onClick={onClose}
          aria-label={t("Close preferences")}
        >
          <X size={16} />
        </button>
      </section>
    </div>
  );
}

function PreferenceNavItem({
  icon,
  label,
  section,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  section: PreferencesSection;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="preferences-nav-item"
      data-section={section}
      data-active={active}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function PreferencesContent({
  section,
  preferences,
  scalePercent,
  onChange,
  onScaleChange,
}: {
  section: PreferencesSection;
  preferences: AppPreferences;
  scalePercent: number;
  onChange: (preferences: AppPreferences) => void;
  onScaleChange: (scale: number) => void;
}) {
  return (
    <div className="preferences-content">
      {section === "interface" ? (
        <InterfacePreferences
          preferences={preferences}
          scalePercent={scalePercent}
          onScaleChange={onScaleChange}
        />
      ) : (
        <AppearancePreferences preferences={preferences} onChange={onChange} />
      )}
    </div>
  );
}

function InterfacePreferences({
  preferences,
  scalePercent,
  onScaleChange,
}: {
  preferences: AppPreferences;
  scalePercent: number;
  onScaleChange: (scale: number) => void;
}) {
  const { t } = useI18n();
  return (
    <section className="preferences-section">
      <div className="preferences-section-heading">
        <div>
          <p>{t("INTERFACE")}</p>
          <h3>{t("Display size")}</h3>
        </div>
        <span>{formatUiScale(preferences.scale)}</span>
      </div>

      <div className="scale-card">
        <div className="scale-preview" aria-hidden="true">
          <div>
            <i />
            <i />
            <i />
          </div>
          <span>Aa</span>
          <small>{scalePercent}%</small>
        </div>
        <div className="scale-controls">
          <div className="scale-stepper">
            <button
              onClick={() => onScaleChange(preferences.scale - UI_SCALE_STEP)}
              disabled={preferences.scale <= MIN_UI_SCALE}
              aria-label={t("Decrease interface size")}
            >
              <Minus size={15} />
            </button>
            <input
              type="range"
              min={MIN_UI_SCALE * 100}
              max={MAX_UI_SCALE * 100}
              step={UI_SCALE_STEP * 100}
              value={scalePercent}
              onChange={(event) => onScaleChange(Number(event.target.value) / 100)}
              aria-label={t("Interface size")}
            />
            <button
              onClick={() => onScaleChange(preferences.scale + UI_SCALE_STEP)}
              disabled={preferences.scale >= MAX_UI_SCALE}
              aria-label={t("Increase interface size")}
            >
              <Plus size={15} />
            </button>
          </div>
          <div className="scale-presets" aria-label={t("Interface size presets")}>
            {UI_SCALE_PRESETS.map((scale) => (
              <button
                key={scale}
                data-active={preferences.scale === scale}
                onClick={() => onScaleChange(scale)}
              >
                {formatUiScale(scale)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="preferences-help">
        {t("Scales the entire window, including project cards, Git history, diffs, and developer tools. Changes apply immediately.")}
      </p>
      <div className="preferences-shortcuts">
        <Keyboard size={14} />
        <span>{t("Quick resize")}</span>
        <kbd>⌘−</kbd>
        <kbd>⌘0</kbd>
        <kbd>⌘+</kbd>
      </div>
    </section>
  );
}

function AppearancePreferences({
  preferences,
  onChange,
}: {
  preferences: AppPreferences;
  onChange: (preferences: AppPreferences) => void;
}) {
  const { t } = useI18n();
  return (
    <section className="preferences-section">
      <div className="preferences-section-heading">
        <div>
          <p>{t("APPEARANCE")}</p>
          <h3>{t("Theme")}</h3>
        </div>
      </div>
      <div className="theme-grid">
        {THEME_OPTIONS.map((theme) => {
          const active = preferences.theme === theme.id;
          return (
            <button
              key={theme.id}
              className="theme-card"
              data-active={active}
              onClick={() => onChange({ ...preferences, theme: theme.id })}
            >
              <span className="theme-swatches" aria-hidden="true">
                {theme.swatches.map((swatch) => (
                  <i key={swatch} style={{ background: swatch }} />
                ))}
              </span>
              <span className="theme-copy">
                <strong>{t(theme.name)}</strong>
                <small>{t(theme.detail)}</small>
              </span>
              <span className="theme-check" aria-hidden="true">
                {active ? <Check size={13} strokeWidth={2.5} /> : null}
              </span>
            </button>
          );
        })}
      </div>
      <div className="theme-note">
        <Palette size={14} />
        <div>
          <strong>{t("Complete window themes")}</strong>
          <span>{t("Each preset updates the chrome, surfaces, controls, and accent color.")}</span>
        </div>
      </div>
    </section>
  );
}
