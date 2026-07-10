import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { DockItem } from "../../types";

type DropdownProps = {
  anchorElement: HTMLElement | null;
  item: DockItem;
  onAction: (actionId: string, label: string) => void;
};

const MENU_WIDTH = 320;
const MENU_MARGIN = 24;

export function Dropdown({ anchorElement, item, onAction }: DropdownProps) {
  const [position, setPosition] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!anchorElement) return undefined;
    const anchor = anchorElement;

    function updatePosition() {
      const rect = anchor.getBoundingClientRect();
      const halfWidth = MENU_WIDTH / 2;
      const minLeft = halfWidth + MENU_MARGIN;
      const maxLeft = window.innerWidth - halfWidth - MENU_MARGIN;
      const centeredLeft = rect.left + rect.width / 2;
      setPosition({
        left: Math.min(Math.max(centeredLeft, minLeft), Math.max(minLeft, maxLeft)),
        top: Math.max(MENU_MARGIN, rect.top - 12),
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorElement]);

  if (!item.menu?.length || !anchorElement) return null;

  return createPortal(
    <div
      className="dock-menu dock-menu-portal w-80 rounded-2xl border border-white/12 p-2"
      data-dock-menu="true"
      style={{ left: position.left, top: position.top }}
    >
      <div className="grid gap-1">
        {item.menu.map((menuItem) => {
          const Icon = menuItem.icon;
          return (
            <button
              key={menuItem.id}
              className={`grid min-h-14 grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                menuItem.planned
                  ? "text-slate-400 hover:bg-white/[0.055] hover:text-slate-200"
                  : "text-slate-200 hover:bg-[rgba(var(--accent-rgb),0.12)] hover:text-white"
              }`}
              onClick={() => onAction(menuItem.actionId, menuItem.label)}
              type="button"
            >
              {menuItem.iconSrc ? (
                <img alt="" aria-hidden="true" className="h-5 w-5 object-contain" src={menuItem.iconSrc} />
              ) : Icon ? (
                <Icon className="h-4 w-4 text-slate-400" />
              ) : null}
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{menuItem.label}</span>
                {menuItem.helper ? <span className="mt-0.5 block truncate text-xs text-slate-500">{menuItem.helper}</span> : null}
              </span>
              {menuItem.badge ? (
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] ${
                    menuItem.badge === "Planned"
                      ? "border-amber-300/22 bg-amber-300/10 text-amber-100"
                      : "border-white/12 bg-white/[0.045] text-slate-300"
                  }`}
                >
                  {menuItem.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
