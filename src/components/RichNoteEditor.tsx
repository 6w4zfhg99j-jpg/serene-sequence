import { useEffect, useRef } from "react";
import { Bold } from "lucide-react";
import { parseBold, segmentsFor } from "@/lib/rich-text";

interface Props {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Markdown-ish `**bold**` string -> HTML for the contenteditable surface. */
function toHtml(raw: string): string {
  const { plain, ranges } = parseBold(raw ?? "");
  const segments = segmentsFor(plain, ranges);
  const html = segments
    .map((s) => {
      const text = escapeHtml(s.text).replace(/\n/g, "<br>");
      return s.bold ? `<strong>${text}</strong>` : text;
    })
    .join("");
  return html;
}

/** HTML from the contenteditable surface -> `**bold**` storage string. */
function fromHtml(root: HTMLElement): string {
  let out = "";

  const walk = (node: Node, bold: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? "").replace(/\u00a0/g, " ");
      if (!text) return;
      out += bold ? `**${text}**` : text;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === "br") {
      out += "\n";
      return;
    }
    const blocky = tag === "div" || tag === "p";
    if (blocky && out.length > 0 && !out.endsWith("\n")) out += "\n";
    const weight = el.style?.fontWeight;
    const isBold =
      bold ||
      tag === "b" ||
      tag === "strong" ||
      weight === "bold" ||
      (!!weight && Number(weight) >= 600);
    el.childNodes.forEach((child) => walk(child, isBold));
  };

  root.childNodes.forEach((child) => walk(child, false));

  // Merge adjacent bold runs: `**a****b**` -> `**ab**`
  return out.replace(/\*\*\*\*/g, "").replace(/\n+$/, "");
}

/**
 * WYSIWYG note editor: bold renders as real bold text, while the value stays a
 * plain string with `**` markers so it round-trips through the DB, the pose
 * card and the PDF export.
 */
export function RichNoteEditor({ value, onChange, rows = 5, placeholder }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string>("");

  // Sync external value in (initial load, reset) without clobbering typing.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value === lastEmitted.current) return;
    el.innerHTML = toHtml(value ?? "");
    lastEmitted.current = value ?? "";
  }, [value]);

  function emit() {
    const el = ref.current;
    if (!el) return;
    const next = fromHtml(el);
    lastEmitted.current = next;
    onChange(next);
  }

  function toggleBold() {
    ref.current?.focus();
    document.execCommand("bold");
    emit();
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
          Select text and press ⌘B to make it bold
        </span>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
            e.preventDefault();
            toggleBold();
          }
        }}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
        }}
        className="w-full overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 text-sm outline-none empty:before:text-ink-subtle empty:before:content-[attr(data-placeholder)]"
        style={{ minHeight: `${rows * 1.5 + 1}rem` }}
      />
    </div>
  );
}
