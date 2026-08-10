/**
 * Lightweight rich text for pose notes.
 *
 * Notes are stored as plain text with markdown-style `**bold**` markers, so the
 * same string round-trips through SQLite, the UI and the PDF export without any
 * HTML sanitising concerns.
 */

export interface BoldRange {
  start: number;
  end: number;
}

/** Strips `**` markers and returns the plain text plus bold ranges over it. */
export function parseBold(raw: string): { plain: string; ranges: BoldRange[] } {
  const ranges: BoldRange[] = [];
  let plain = "";
  let i = 0;
  while (i < raw.length) {
    if (raw.startsWith("**", i)) {
      const close = raw.indexOf("**", i + 2);
      if (close > i + 2) {
        const inner = raw.slice(i + 2, close);
        ranges.push({ start: plain.length, end: plain.length + inner.length });
        plain += inner;
        i = close + 2;
        continue;
      }
    }
    plain += raw[i];
    i += 1;
  }
  return { plain, ranges };
}

/** Plain text with all formatting markers removed. */
export function stripBold(raw: string): string {
  return parseBold(raw).plain;
}

export interface Segment {
  text: string;
  bold: boolean;
}

/** Splits a slice of the plain text (by index) into bold/normal segments. */
export function segmentsFor(
  plain: string,
  ranges: BoldRange[],
  from = 0,
  to = plain.length,
): Segment[] {
  const out: Segment[] = [];
  let cursor = from;
  const isBold = (idx: number) => ranges.some((r) => idx >= r.start && idx < r.end);
  while (cursor < to) {
    const bold = isBold(cursor);
    let end = cursor + 1;
    while (end < to && isBold(end) === bold) end += 1;
    out.push({ text: plain.slice(cursor, end), bold });
    cursor = end;
  }
  return out;
}

/** Renders `**bold**` notes as React nodes, preserving line breaks. */
export function RichText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const { plain, ranges } = parseBold(text);
  const segments = segmentsFor(plain, ranges);
  return (
    <span className={className} style={{ whiteSpace: "pre-wrap" }}>
      {segments.map((s, i) =>
        s.bold ? (
          <strong key={i} className="font-semibold text-ink">
            {s.text}
          </strong>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </span>
  );
}
