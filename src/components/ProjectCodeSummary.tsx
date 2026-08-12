import { Code2, Tag } from "lucide-react";
import { useI18n } from "../lib/i18n";
import type { ProjectLanguage } from "../types";

export function ProjectCodeSummary({
  languages,
  compact = false,
}: {
  languages: ProjectLanguage[];
  compact?: boolean;
}) {
  const { t } = useI18n();
  if (languages.length === 0) return null;
  const visible = languages.slice(0, compact ? 2 : 4);
  const label = languages
    .map((language) => `${language.name} ${formatPercentage(language.percentage)}`)
    .join(" · ");

  return (
    <div className="project-code-summary" data-compact={compact} title={label}>
      <div className="project-language-bar" aria-label={t("Project code languages")}>
        {languages.map((language) => (
          <i
            key={language.name}
            style={{
              backgroundColor: language.color,
              flexGrow: Math.max(language.bytes, 1),
            }}
          />
        ))}
      </div>
      <div className="project-language-legend">
        <Code2 size={10} />
        {visible.map((language) => (
          <span key={language.name}>
            <i style={{ backgroundColor: language.color }} />
            {language.name}
            <small>{formatPercentage(language.percentage)}</small>
          </span>
        ))}
        {languages.length > visible.length ? <em>+{languages.length - visible.length}</em> : null}
      </div>
    </div>
  );
}

export function ProjectTags({ tags, compact = false }: { tags: string[]; compact?: boolean }) {
  const { t } = useI18n();
  if (tags.length === 0) return null;
  const visible = tags.slice(0, compact ? 2 : 4);
  return (
    <div className="project-tag-chips" title={tags.join(", ")} aria-label={t("Project tags")}>
      <Tag size={10} />
      {visible.map((tag) => <span key={tag}>{tag}</span>)}
      {tags.length > visible.length ? <em>+{tags.length - visible.length}</em> : null}
    </div>
  );
}

function formatPercentage(value: number): string {
  return `${value < 0.1 ? "<0.1" : value.toFixed(value >= 10 ? 1 : 2)}%`;
}
