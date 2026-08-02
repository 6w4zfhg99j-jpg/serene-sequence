import { jsPDF } from "jspdf";
import { getSignedImageUrls, formatDuration, type Sequence } from "@/lib/yoga-api";
import { localBridge } from "@/lib/local-bridge";

/** Paths that the browser/Electron renderer can load directly. */
function isDirectUrl(p: string): boolean {
  return (
    p.startsWith("http") ||
    p.startsWith("data:") ||
    p.startsWith("blob:") ||
    p.startsWith("local://") ||
    p.startsWith("file://")
  );
}

/** Only storage keys (non-direct paths) need signing. */
export async function resolveExportUrls(paths: (string | null | undefined)[]) {
  const keys = paths.filter((p): p is string => !!p && !isDirectUrl(p));
  const signed = keys.length ? await getSignedImageUrls(keys) : {};
  return (path: string | null | undefined): string | null => {
    if (!path) return null;
    if (isDirectUrl(path)) return path;
    return signed[path] ?? null;
  };
}

type LoadedImage = { dataUrl: string; format: "PNG" | "JPEG"; w: number; h: number };

const imageCache = new Map<string, LoadedImage | null>();

function decode(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error(`image decode failed (${src.slice(0, 64)}…)`));
    img.src = src;
  });
}

/** Turns a Blob into a data: URL. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error ?? new Error("FileReader failed"));
    fr.readAsDataURL(blob);
  });
}

/**
 * Produces a data: URL for any image source the app uses.
 *
 * Electron: `local://` photos are read straight off disk through the main
 * process. The renderer can display them via <img>, but `fetch()` on the
 * custom scheme can be blocked by CSP — which is exactly why exported PDFs
 * came out with empty boxes. Reading through IPC removes that dependency and
 * also avoids canvas tainting.
 *
 * Web: signed/remote URLs are fetched and inlined.
 */
async function toDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;

  const bridge = localBridge();
  if (url.startsWith("local://") && bridge?.images.readDataUrl) {
    return bridge.images.readDataUrl(url);
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} → HTTP ${res.status}`);
  return blobToDataUrl(await res.blob());
}

/** Loads and decodes an image so jsPDF receives valid, correctly typed data. */
async function loadImageAsDataUrl(url: string): Promise<LoadedImage | null> {
  if (imageCache.has(url)) return imageCache.get(url) ?? null;
  let result: LoadedImage | null = null;
  try {
    const dataUrl = await toDataUrl(url);
    const img = await decode(dataUrl);
    if (!img.naturalWidth || !img.naturalHeight) {
      throw new Error(`image has zero dimensions: ${url}`);
    }
    const isPng = dataUrl.startsWith("data:image/png");
    const isJpeg = /^data:image\/jpe?g/.test(dataUrl);
    if (isPng || isJpeg) {
      result = {
        dataUrl,
        format: isPng ? "PNG" : "JPEG",
        w: img.naturalWidth,
        h: img.naturalHeight,
      };
    } else {
      // webp/gif/etc — re-encode to PNG, which jsPDF can embed.
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("2d canvas context unavailable");
      ctx.drawImage(img, 0, 0);
      result = {
        dataUrl: canvas.toDataURL("image/png"),
        format: "PNG",
        w: img.naturalWidth,
        h: img.naturalHeight,
      };
    }
  } catch (err) {
    console.error("[pdf] could not load image", url, err);
    result = null;
  }
  imageCache.set(url, result);
  return result;
}


export type PdfFormat = "a4" | "screen";
/** Cards per row. A4 supports 5 or 7; screen supports 7 or 10. */
export type PdfColumns = 5 | 7 | 10;

export const COLUMN_OPTIONS: Record<PdfFormat, PdfColumns[]> = {
  a4: [5, 7],
  screen: [7, 10],
};

export function defaultColumns(format: PdfFormat): PdfColumns {
  return format === "screen" ? 10 : 5;
}

/** Page geometry per export format. Screen = 16:9 landscape for laptops/tablets. */
export function pageSize(format: PdfFormat) {
  return format === "screen"
    ? { w: 297, h: 167, orientation: "landscape" as const, spec: [297, 167] as [number, number] }
    : { w: 210, h: 297, orientation: "portrait" as const, spec: "a4" as const };
}


const INSTAGRAM = "Instagram: @vonasequencedesigner";

/** Corner radius (mm) matching the app's rounded card style. */
export function cardRadius(size: number) {
  return Math.max(1, Math.min(3, size * 0.09));
}

/**
 * Draws `body` with everything clipped to a rounded rectangle so photos never
 * poke out past the card corners. Falls back to unclipped drawing if the
 * renderer does not support clipping paths.
 */
function withRoundedClip(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  body: () => void
) {
  const d = doc as unknown as {
    saveGraphicsState?: () => void;
    restoreGraphicsState?: () => void;
    clip?: () => void;
    discardPath?: () => void;
    roundedRect: (
      x: number,
      y: number,
      w: number,
      h: number,
      rx: number,
      ry: number,
      style?: string | null
    ) => void;
  };
  if (!d.saveGraphicsState || !d.clip) {
    body();
    return;
  }
  try {
    d.saveGraphicsState();
    d.roundedRect(x, y, w, h, r, r, null);
    d.clip();
    d.discardPath?.();
    body();
  } catch (err) {
    console.error("[pdf] rounded clip failed", err);
    body();
  } finally {
    try {
      d.restoreGraphicsState?.();
    } catch {
      /* noop */
    }
  }
}

export async function exportSequencePdf(
  seq: Sequence,
  opts: { includeNotes: boolean; layout?: PdfLayout; format?: PdfFormat }
) {
  const format = opts.format ?? "a4";
  if ((opts.layout ?? "list") === "grid") {
    return exportSequenceGridPdf(seq, { includeNotes: opts.includeNotes, format });
  }
  const page = pageSize(format);
  const pageW = page.w;
  const margin = 16;
  const ink = "#2a2620";
  const muted = "#6b665e";
  const rowH = 38;
  const imgSize = 32;

  // Measure the header first so the document can be created as ONE continuous
  // page tall enough for the whole practice (no page breaks).
  const measure = new jsPDF({
    unit: "mm",
    orientation: page.orientation,
    format: page.spec,
  });
  measure.setFont("helvetica", "normal");
  measure.setFontSize(10);
  const descLineCount = seq.description
    ? (measure.splitTextToSize(seq.description, pageW - margin * 2) as string[]).length
    : 0;
  const pnLineCount = seq.practice_notes
    ? (measure.splitTextToSize(seq.practice_notes, pageW - margin * 2) as string[]).length
    : 0;
  const headerBottom =
    margin +
    9 +
    6 +
    (descLineCount ? 7 + descLineCount * 5 : 0) +
    (pnLineCount ? 6 + pnLineCount * 5 : 0) +
    6;
  const pageH = Math.max(
    page.h,
    headerBottom + 8 + seq.items.length * rowH + 16
  );

  const doc = new jsPDF({
    unit: "mm",
    orientation: pageH >= pageW ? "portrait" : "landscape",
    format: [pageW, pageH],
  });

  // Resolve every image URL, then fully preload the bitmaps before drawing.
  const resolve = await resolveExportUrls(seq.items.map((it) => it.pose.image_url));
  for (const it of seq.items) {
    if (it.pose.image_url && !resolve(it.pose.image_url)) {
      console.error("[pdf] could not resolve image path", it.pose.image_url);
    }
  }
  const loaded = new Map<string, LoadedImage | null>();
  await Promise.all(
    Array.from(
      new Set(
        seq.items
          .map((it) => resolve(it.pose.image_url))
          .filter((u): u is string => !!u)
      )
    ).map(async (u) => loaded.set(u, await loadImageAsDataUrl(u)))
  );

  // Header — brand line, practice name, meta, practice notes
  let hy = margin;
  doc.setFont("times", "italic");
  doc.setFontSize(12);
  doc.setTextColor(ink);
  doc.text("VONA", margin, hy);
  const vonaW = doc.getTextWidth("VONA");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(muted);
  doc.text("SEQUENCE DESIGNER", margin + vonaW + 2, hy);


  hy += 9;
  doc.setTextColor(ink);
  doc.setFont("times", "italic");
  doc.setFontSize(28);
  doc.text(seq.title, margin, hy);

  hy += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(muted);
  const totalDur = seq.items.reduce(
    (s, it) => s + (it.duration_seconds ?? it.pose.duration_seconds ?? 0),
    0
  );
  const meta = [
    `${seq.items.length} poses`,
    formatDuration(totalDur),
    seq.level.replace("-", " "),
    seq.tags.map((t) => `#${t.name}`).join("  "),
  ]
    .filter(Boolean)
    .join("   ·   ");
  doc.text(meta, margin, hy);

  if (seq.description) {
    hy += 7;
    doc.setFontSize(10);
    doc.setTextColor(ink);
    const lines = doc.splitTextToSize(seq.description, pageW - margin * 2);
    doc.text(lines, margin, hy);
    hy += lines.length * 5;
  }

  if (seq.practice_notes) {
    hy += 6;
    doc.setFontSize(10);
    doc.setTextColor(ink);
    const noteLines = doc.splitTextToSize(seq.practice_notes, pageW - margin * 2);
    doc.text(noteLines, margin, hy);
    hy += noteLines.length * 5;
  }

  hy += 6;
  doc.setDrawColor(220, 216, 208);
  doc.line(margin, hy, pageW - margin, hy);

  let y = hy + 8;

  for (let i = 0; i < seq.items.length; i++) {
    const it = seq.items[i];


    // Number
    doc.setFont("times", "italic");
    doc.setFontSize(16);
    doc.setTextColor(muted);
    doc.text(String(i + 1).padStart(2, "0"), margin, y + 8);

    // Image — rounded card, image clipped inside the corners
    const url = resolve(it.pose.image_url);
    const x = margin + 12;
    const radius = cardRadius(imgSize);
    doc.setFillColor(250, 249, 246);
    doc.roundedRect(x, y, imgSize, imgSize, radius, radius, "F");
    if (url) {
      const img = loaded.get(url) ?? null;
      if (img) {
        const ratio = img.w / img.h;
        let w = imgSize;
        let h = imgSize;
        if (ratio > 1) h = imgSize / ratio;
        else w = imgSize * ratio;
        withRoundedClip(doc, x, y, imgSize, imgSize, radius, () => {
          try {
            doc.addImage(
              img.dataUrl,
              img.format,
              x + (imgSize - w) / 2,
              y + (imgSize - h) / 2,
              w,
              h
            );
          } catch (err) {
            console.error("[pdf] failed to embed image", url, err);
          }
        });
      }
    }
    doc.setDrawColor(230, 226, 218);
    doc.roundedRect(x, y, imgSize, imgSize, radius, radius, "S");


    // Text
    const tx = x + imgSize + 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(ink);
    doc.text(it.pose.name, tx, y + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(muted);
    if (it.pose.sanskrit_name) {
      doc.text(it.pose.sanskrit_name, tx, y + 11);
    }

    const dur = it.duration_seconds ?? it.pose.duration_seconds;
    const bits: string[] = [];
    if (dur) bits.push(formatDuration(dur));
    if (it.side) bits.push(it.side);
    if (bits.length) {
      doc.text(bits.join("  ·  "), tx, y + 16);
    }

    if (opts.includeNotes && it.notes) {
      doc.setTextColor(ink);
      doc.setFontSize(9);
      const noteLines = doc.splitTextToSize(it.notes, pageW - margin - tx);
      doc.text(noteLines.slice(0, 3), tx, y + 22);
    }

    y += rowH;
  }

  // Footer
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(muted);
  doc.text(`${seq.title}`, margin, pageH - 8);
  doc.text(INSTAGRAM, pageW / 2, pageH - 8, { align: "center" });


  doc.save(`${seq.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`);
}

export async function exportSequenceGridPdf(
  seq: Sequence,
  opts: { includeNotes?: boolean; format?: PdfFormat } = {}
) {
  const withNotes = opts.includeNotes !== false;
  const format = opts.format ?? "a4";
  const isScreen = format === "screen";
  const geom = pageSize(format);
  const measure = new jsPDF({
    unit: "mm",
    orientation: geom.orientation,
    format: geom.spec,
  });
  const pageW = geom.w;
  const baseH = geom.h;

  const margin = isScreen ? 9 : 12;
  const ink = "#2a2620";
  const muted = "#6b665e";

  const resolve = await resolveExportUrls(seq.items.map((it) => it.pose.image_url));
  for (const it of seq.items) {
    if (it.pose.image_url && !resolve(it.pose.image_url)) {
      console.error("[pdf] could not resolve image path", it.pose.image_url);
    }
  }
  const loaded = new Map<string, LoadedImage | null>();
  await Promise.all(
    Array.from(
      new Set(
        seq.items
          .map((it) => resolve(it.pose.image_url))
          .filter((u): u is string => !!u)
      )
    ).map(async (u) => loaded.set(u, await loadImageAsDataUrl(u)))
  );

  // Grid metrics — screen format is a teaching board: comfortable cards
  // sized so ~4 rows fit on one landscape page.
  const hasNotes = withNotes && seq.items.some((it) => !!it.notes);
  const cols = isScreen ? 10 : 5;
  const gap = isScreen ? 3 : 4;
  const cardW = (pageW - margin * 2 - gap * (cols - 1)) / cols;
  const labelH = isScreen ? (hasNotes ? 10 : 7) : hasNotes ? 16 : 9;

  // Practice notes live in the upper-right corner, clear of the sequence grid.
  const notesW = (pageW - margin * 2) * 0.38;
  measure.setFont("helvetica", "normal");
  measure.setFontSize(8.5);
  const notesLines = seq.practice_notes
    ? (measure.splitTextToSize(seq.practice_notes, notesW) as string[])
    : [];
  const notesBlockH = notesLines.length ? 4 + notesLines.length * 4 : 0;
  const headerH = Math.max(isScreen ? 19 : 24, notesBlockH + (isScreen ? 6 : 8));
  const footerH = isScreen ? 8 : 10;
  const firstTop = margin + headerH;

  let imgH = cardW;
  if (isScreen) {
    const targetRows = 4;
    const avail = baseH - firstTop - margin - footerH;
    imgH = Math.max(12, (avail - gap * (targetRows - 1)) / targetRows - labelH);
  }
  const cardH = imgH + labelH;

  // One continuous page: extend the document height to fit every row.
  const rows = Math.max(1, Math.ceil(seq.items.length / cols));
  const pageH = Math.max(
    baseH,
    firstTop + rows * (cardH + gap) - gap + footerH + margin
  );

  const doc = new jsPDF({
    unit: "mm",
    orientation: pageH >= pageW ? "portrait" : "landscape",
    format: [pageW, pageH],
  });




  function drawHeader() {
    doc.setFont("times", "italic");
    doc.setFontSize(12);
    doc.setTextColor(ink);
    doc.text("VONA", margin, margin);
    const vonaW = doc.getTextWidth("VONA");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(muted);
    doc.text("SEQUENCE DESIGNER", margin + vonaW + 2, margin);

    doc.setFont("times", "italic");
    doc.setFontSize(20);
    doc.setTextColor(ink);
    doc.text(seq.title, margin, margin + 10);

    const totalDur = seq.items.reduce(
      (s, it) => s + (it.duration_seconds ?? it.pose.duration_seconds ?? 0),
      0
    );
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(muted);
    const meta = [
      `${seq.items.length} poses`,
      formatDuration(totalDur),
      seq.level.replace("-", " "),
      seq.tags.map((t) => `#${t.name}`).join("  "),
    ]
      .filter(Boolean)
      .join("   ·   ");
    doc.text(meta, margin, margin + 15);

    if (notesLines.length) {
      const nx = pageW - margin;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(muted);
      doc.text("PRACTICE NOTES", nx, margin, { align: "right" });
      doc.setFontSize(8.5);
      doc.setTextColor(ink);
      notesLines.forEach((ln, li) => {
        doc.text(ln, nx, margin + 4.5 + li * 4, { align: "right" });
      });
    }

    const rule = margin + headerH - 4;
    doc.setDrawColor(220, 216, 208);
    doc.line(margin, rule, pageW - margin, rule);
  }


  drawHeader();
  let y = firstTop;
  let col = 0;

  for (let i = 0; i < seq.items.length; i++) {


    const it = seq.items[i];
    const x = margin + col * (cardW + gap);

    // Image box — rounded card matching the app's card style
    const radius = cardRadius(Math.min(cardW, imgH));
    doc.setDrawColor(230, 226, 218);
    doc.setFillColor(250, 249, 246);
    doc.roundedRect(x, y, cardW, imgH, radius, radius, "FD");

    const url = resolve(it.pose.image_url);
    if (url) {
      const img = loaded.get(url) ?? null;
      if (img) {
        const ratio = img.w / img.h;
        const pad = 1.5;
        const boxW = cardW - pad * 2;
        const boxH = imgH - pad * 2;
        let w = boxW;
        let h = boxW / ratio;
        if (h > boxH) {
          h = boxH;
          w = boxH * ratio;
        }
        withRoundedClip(doc, x, y, cardW, imgH, radius, () => {
          try {
            doc.addImage(
              img.dataUrl,
              img.format,
              x + (cardW - w) / 2,
              y + (imgH - h) / 2,
              w,
              h
            );
          } catch (err) {
            console.error("[pdf] failed to embed image", url, err);
          }
        });
      }
    }


    // Index badge
    doc.setFont("times", "italic");
    doc.setFontSize(isScreen ? 6.5 : 8);
    doc.setTextColor(muted);
    doc.text(String(i + 1).padStart(2, "0"), x + 1.2, y + (isScreen ? 3.6 : 4.5));

    // Name
    const nameLead = isScreen ? 2.7 : 3;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(isScreen ? 7 : 7.5);
    doc.setTextColor(ink);
    const nameLines = doc
      .splitTextToSize(it.pose.name, cardW - 1)
      .slice(0, 2) as string[];
    nameLines.forEach((ln, li) => {
      doc.text(ln, x + cardW / 2, y + imgH + 3 + li * nameLead, { align: "center" });
    });

    // Duration / side
    const dur = it.duration_seconds ?? it.pose.duration_seconds;
    const bits: string[] = [];
    if (dur) bits.push(formatDuration(dur));
    if (it.side) bits.push(it.side);
    let ty = y + imgH + 3 + nameLines.length * nameLead;
    if (bits.length) {
      doc.setFontSize(isScreen ? 5.8 : 6.5);
      doc.setTextColor(muted);
      doc.text(bits.join(" · "), x + cardW / 2, ty, { align: "center" });
      ty += isScreen ? 2.3 : 2.6;
    }

    // Pose note — small, light grey, directly under the name
    if (withNotes && it.notes) {
      doc.setFontSize(isScreen ? 5.2 : 5.8);
      doc.setTextColor(150, 146, 138);
      const noteLines = doc
        .splitTextToSize(it.notes, cardW - 1)
        .slice(0, isScreen ? 2 : 3) as string[];
      noteLines.forEach((ln, li) => {
        doc.text(ln, x + cardW / 2, ty + li * (isScreen ? 2.1 : 2.3), { align: "center" });
      });
    }


    col += 1;
    if (col === cols) {
      col = 0;
      y += cardH + gap;
    }

  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(muted);
  doc.text(INSTAGRAM, pageW / 2, pageH - 6, { align: "center" });


  doc.save(`${seq.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-grid.pdf`);
}
