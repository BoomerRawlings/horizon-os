import { SendHorizonal, PenLine } from "lucide-react";
import { useRef, useState } from "react";
import { Panel } from "../ui/Panel";

type CaptureBarProps = {
  onCapture: () => void;
  onTextChange: (value: string) => void;
  value: string;
};

export function CaptureBar({ onCapture, onTextChange, value }: CaptureBarProps) {
  const [emptyPrompt, setEmptyPrompt] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <Panel className="capture-panel mt-4 p-4">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-3">
          <PenLine className="h-5 w-5 text-slate-300" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white">Capture</h2>
        </div>
        <p aria-live="polite" className={`text-xs transition ${emptyPrompt ? "text-amber-200" : "text-slate-500"}`}>
          {emptyPrompt ? "Type a thought first." : "Nothing is filed until you approve it."}
        </p>
      </div>
      <form
        className="grid grid-cols-[1fr_auto] gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (!value.trim()) {
            setEmptyPrompt(true);
            inputRef.current?.focus();
            return;
          }
          setEmptyPrompt(false);
          onCapture();
        }}
      >
        <input
          aria-invalid={emptyPrompt || undefined}
          className={`h-12 rounded-xl border bg-[#0d1928] px-5 text-base text-slate-100 outline-none transition placeholder:italic placeholder:text-slate-500 focus:ring-4 focus:ring-[rgba(var(--accent-rgb),0.1)] ${
            emptyPrompt ? "border-amber-300/45" : "border-white/8 focus:border-[rgba(var(--accent-rgb),0.5)]"
          }`}
          onChange={(event) => {
            const nextValue = event.target.value;
            if (nextValue.trim()) setEmptyPrompt(false);
            onTextChange(nextValue);
          }}
          placeholder="Quick note, task, or idea..."
          ref={inputRef}
          type="text"
          value={value}
        />
        <button
          className="flex h-12 min-w-36 items-center justify-center gap-3 rounded-xl border border-white/12 bg-[#142235] px-5 text-slate-100 transition hover:border-[rgba(var(--accent-rgb),0.36)] hover:bg-[#172940] active:scale-[0.99]"
          type="submit"
        >
          <SendHorizonal className="h-5 w-5 text-[rgb(var(--accent-rgb))]" />
          Capture
        </button>
      </form>
    </Panel>
  );
}
