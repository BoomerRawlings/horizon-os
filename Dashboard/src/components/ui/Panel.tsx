import type { ReactNode } from "react";

type PanelProps = {
  children: ReactNode;
  className?: string;
};

export function Panel({ children, className = "" }: PanelProps) {
  return (
    <section
      className={`rounded-[18px] border border-white/10 bg-[rgba(15,28,44,0.9)] shadow-panel ${className}`}
    >
      {children}
    </section>
  );
}
