import type { PriorityTask } from "../../types";

const priorityStyles: Record<PriorityTask["priority"], string> = {
  High: "border-red-300/25 bg-red-400/10 text-red-200",
  Medium: "border-amber-300/25 bg-amber-300/10 text-amber-200",
  Low: "border-slate-300/20 bg-slate-300/10 text-slate-300",
};

type BadgeProps = {
  priority: PriorityTask["priority"];
};

export function PriorityBadge({ priority }: BadgeProps) {
  return (
    <span className={`rounded-md border px-2.5 py-1 text-xs font-medium ${priorityStyles[priority]}`}>
      {priority}
    </span>
  );
}
