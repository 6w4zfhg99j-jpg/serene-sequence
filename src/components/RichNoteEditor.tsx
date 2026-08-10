import { useRef } from "react";
import { Bold } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}

/**
 * Plain-text note editor with a single formatting affordance: wrap the current
 * selection in `**` markers (also bound to Cmd/Ctrl+B).
 */
export function RichNoteEditor({ value, onChange, rows = 5, placeholder }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function toggleBold() {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (start === end) return;
    const selected = value.slice(start, end);
    const already = selected.startsWith("**") && selected.endsWith("**") && selected.length > 4;
    const next = already
      ? value.slice(0, start) + selected.slice(2, -2) + value.slice(end)
      : value.slice(0, start) + "**" + selected + "**" + value.slice(end);
    onChange(next);
    const delta = already ? -2 : 2;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + Math.max(delta, 0), end + delta);
    });
  }

  return (
    <div className="rounded-md border border-line bg-background">
      <div className="flex items-center gap-1 border-b border-line px-1.5 py-1">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleBold}
          className="flex size-7 items-center justify-center rounded text-ink-muted transition-colors hover:bg-surface hover:text-ink"
          aria-label="Bold"
          title="Bold (⌘B)"
        >
          <Bold className="size-3.5" />
        </button>
        <span className="ml-1 text-[11px] text-ink-subtle">
          Select text and press B to make it bold
        </span>
      </div>
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
            e.preventDefault();
            toggleBold();
          }
        }}
        rows={rows}
        placeholder={placeholder}
        className="resize-y border-0 bg-transparent focus-visible:ring-0"
      />
    </div>
  );
}
