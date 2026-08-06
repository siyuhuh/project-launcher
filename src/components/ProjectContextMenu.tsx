import {
  Activity,
  Copy,
  FolderOpen,
  Settings2,
  TerminalSquare,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { ProjectView } from "../types";

interface Props {
  project: ProjectView;
  position: { x: number; y: number };
  onClose: () => void;
  onCopyPath: () => void;
  onTasks: () => void;
  onTools: () => void;
  onOpenFolder: () => void;
  onOpenTerminal: () => void;
  onEdit: () => void;
}

interface MenuPosition {
  left: number;
  top: number;
  origin: string;
}

export function ProjectContextMenu({
  project,
  position,
  onClose,
  onCopyPath,
  onTasks,
  onTools,
  onOpenFolder,
  onOpenTerminal,
  onEdit,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition>({
    left: position.x,
    top: position.y,
    origin: "top left",
  });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const viewportPadding = 8;
    const left = Math.max(
      viewportPadding,
      Math.min(position.x, window.innerWidth - rect.width - viewportPadding),
    );
    const top = Math.max(
      viewportPadding,
      Math.min(position.y, window.innerHeight - rect.height - viewportPadding),
    );
    setMenuPosition({
      left,
      top,
      origin: `${left < position.x ? "right" : "left"} ${top < position.y ? "bottom" : "top"}`,
    });
    menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [position.x, position.y]);

  useEffect(() => {
    const closeFromOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const closeFromKeyboard = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("pointerdown", closeFromOutside, true);
    window.addEventListener("keydown", closeFromKeyboard, true);
    window.addEventListener("resize", onClose);
    document.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("pointerdown", closeFromOutside, true);
      window.removeEventListener("keydown", closeFromKeyboard, true);
      window.removeEventListener("resize", onClose);
      document.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  function invoke(action: () => void) {
    onClose();
    action();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!matchesNavigationKey(event.key)) return;
    event.preventDefault();
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
    );
    if (items.length === 0) return;
    const activeIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Home") items[0].focus();
    if (event.key === "End") items[items.length - 1]?.focus();
    if (event.key === "ArrowDown") items[(activeIndex + 1 + items.length) % items.length].focus();
    if (event.key === "ArrowUp") items[(activeIndex - 1 + items.length) % items.length].focus();
  }

  const style = {
    left: menuPosition.left,
    top: menuPosition.top,
    transformOrigin: menuPosition.origin,
  } satisfies CSSProperties;

  return createPortal(
    <div
      ref={menuRef}
      className="project-context-menu"
      style={style}
      role="menu"
      aria-label={`Actions for ${project.name}`}
      onKeyDown={handleKeyDown}
    >
      <MenuItem icon={FolderOpen} label="Reveal in Finder" onClick={() => invoke(onOpenFolder)} />
      <MenuItem icon={TerminalSquare} label="Open in Terminal" onClick={() => invoke(onOpenTerminal)} />
      <MenuItem icon={Copy} label="Copy project path" onClick={() => invoke(onCopyPath)} />

      <MenuSeparator />
      <MenuItem icon={Activity} label="Tasks and health" onClick={() => invoke(onTasks)} />
      <MenuItem icon={Wrench} label="Developer tools" onClick={() => invoke(onTools)} />

      <MenuSeparator />
      <MenuItem icon={Settings2} label="Edit project" onClick={() => invoke(onEdit)} />
    </div>,
    document.body,
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" role="menuitem" onClick={onClick}>
      <Icon size={14} />
      <span>{label}</span>
    </button>
  );
}

function MenuSeparator() {
  return <div className="project-context-menu-separator" role="separator" />;
}

function matchesNavigationKey(key: string): boolean {
  return key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End";
}
