import { jsPDF } from "jspdf";
import { getSignedImageUrls, type Sequence } from "@/lib/yoga-api";
import {
  VONA_SANS_TTF_BASE64,
  VONA_SERIF_ITALIC_TTF_BASE64,
} from "@/lib/pdf-fonts";

/** Font names used everywhere in the export (Unicode: Latin + Cyrillic). */
const SANS = "VonaSans";
const SERIF = "VonaSerif";

/**
 * Registers the embedded Unicode fonts on a jsPDF instance. jsPDF's built-in
 * Helvetica/Times are WinAnsi-only, so Ukrainian/Russian titles came out as
 * garbage; these subsets cover Latin, Cyrillic and Greek.
 */
function registerFonts(doc: jsPDF) {
  doc.addFileToVFS("VonaSans.ttf", VONA_SANS_TTF_BASE64);
  doc.addFont("VonaSans.ttf", SANS, "normal");
  doc.addFileToVFS("VonaSerifItalic.ttf", VONA_SERIF_ITALIC_TTF_BASE64);
  doc.addFont("VonaSerifItalic.ttf", SERIF, "italic");
}

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

/** Longest edge (px) kept for embedded photos — plenty for print/retina cards. */
const MAX_IMAGE_EDGE = 720;
/** JPEG quality: ~30% smaller files with no visible loss at card size. */
const JPEG_QUALITY = 0.7;

/**
 * Loads, downscales and re-encodes an image so jsPDF embeds a compact JPEG
 * instead of the original full-resolution bitmap.
 */
async function loadImageAsDataUrl(url: string): Promise<LoadedImage | null> {
  if (imageCache.has(url)) return imageCache.get(url) ?? null;
  let result: LoadedImage | null = null;
  try {
    const dataUrl = await toDataUrl(url);
    const img = await decode(dataUrl);
    if (!img.naturalWidth || !img.naturalHeight) {
      throw new Error(`image has zero dimensions: ${url}`);
    }
    const ratio = Math.min(
      1,
      MAX_IMAGE_EDGE / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const w = Math.max(1, Math.round(img.naturalWidth * ratio));
    const h = Math.max(1, Math.round(img.naturalHeight * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d canvas context unavailable");
    // Flatten onto the card background so transparency does not turn black.
    ctx.fillStyle = "#faf9f6";
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);
    result = {
      dataUrl: canvas.toDataURL("image/jpeg", JPEG_QUALITY),
      format: "JPEG",
      w,
      h,
    };
  } catch (err) {
    console.error("[pdf] could not load image", url, err);
    result = null;
  }
  imageCache.set(url, result);
  return result;
}



export type PdfFormat = "a4" | "screen";
/** Cards per row. A4 supports 3 or 5; screen supports 7 or 10. */
export type PdfColumns = 3 | 5 | 7 | 10;

export const COLUMN_OPTIONS: Record<PdfFormat, PdfColumns[]> = {
  a4: [5, 3],
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
  opts: { includeNotes?: boolean; format?: PdfFormat; columns?: PdfColumns } = {}
) {
  return exportSequenceGridPdf(seq, opts);
}

export async function exportSequenceGridPdf(
  seq: Sequence,
  opts: { includeNotes?: boolean; format?: PdfFormat; columns?: PdfColumns } = {}
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
  registerFonts(measure);

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
  const allowed = COLUMN_OPTIONS[format];
  const cols = allowed.includes(opts.columns as PdfColumns)
    ? (opts.columns as PdfColumns)
    : defaultColumns(format);
  // Denser grids need tighter gaps and smaller type to stay balanced.
  const dense = cols >= 10;
  // 7-col screen layout is a "teaching board": fewer rows so each card is
  // noticeably larger for viewing from a distance. 10-col stays compact.
  const screenRows = isScreen ? (cols <= 7 ? 3 : 4) : 0;
  const gap = dense ? 3 : isScreen ? 4 : cols <= 3 ? 5 : 4;
  const cardW = (pageW - margin * 2 - gap * (cols - 1)) / cols;
  // 3-col portrait is a large, readable teaching layout; allow the cards to
  // grow well beyond the compact 5-col scale.
  const maxScale = isScreen ? (cols <= 7 ? 1.55 : 1.25) : cols <= 3 ? 1.7 : 1.25;
  const scale = Math.min(
    maxScale,
    Math.max(0.9, cardW / (isScreen ? 26 : 36))
  );
  // Text metrics — every card reserves the exact space its wrapped title,
  // side marker and note need, so nothing can overlap the row above.
  const nameSize = (isScreen ? 7 : 7.5) * scale;
  const nameLead = (isScreen ? 2.7 : 3) * scale;
  const sideSize = (isScreen ? 5.8 : 6.5) * scale;
  const sideLead = (isScreen ? 2.3 : 2.6) * scale;
  const noteSize = (isScreen ? 5.2 : 5.8) * scale;
  const noteLead = (isScreen ? 2.1 : 2.3) * scale;
  const maxNameLines = 3;
  const maxNoteLines = isScreen ? 2 : 3;
  const labelTop = 3;
  const labelBottom = 1.5 * scale;

  measure.setFont("helvetica", "normal");
  const cardText = seq.items.map((it) => {
    measure.setFontSize(nameSize);
    const nameLines = (
      measure.splitTextToSize(it.pose.name, cardW - 1) as string[]
    ).slice(0, maxNameLines);
    measure.setFontSize(noteSize);
    const noteLines =
      withNotes && it.notes
        ? (measure.splitTextToSize(it.notes, cardW - 1) as string[]).slice(
            0,
            maxNoteLines
          )
        : [];
    const height =
      labelTop +
      nameLines.length * nameLead +
      (it.side ? sideLead : 0) +
      noteLines.length * noteLead +
      labelBottom;
    return { nameLines, noteLines, height };
  });
  const maxLabelH = cardText.length
    ? Math.max(...cardText.map((c) => c.height))
    : (hasNotes ? 10 : 7) * scale;

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
    const avail = baseH - firstTop - margin - footerH;
    imgH = Math.max(12, (avail - gap * (screenRows - 1)) / screenRows - maxLabelH);
  }

  // Each row grows to fit its tallest label block; spacing stays uniform.
  const rows = Math.max(1, Math.ceil(seq.items.length / cols));
  const rowLabelH: number[] = [];
  for (let r = 0; r < rows; r++) {
    const slice = cardText.slice(r * cols, r * cols + cols);
    rowLabelH.push(
      slice.length ? Math.max(...slice.map((c) => c.height)) : maxLabelH
    );
  }
  const gridH =
    rowLabelH.reduce((sum, h) => sum + imgH + h + gap, 0) - gap;

  // One continuous page: extend the document height to fit every row.
  const pageH = Math.max(baseH, firstTop + gridH + footerH + margin);


  const doc = new jsPDF({
    unit: "mm",
    orientation: pageH >= pageW ? "portrait" : "landscape",
    format: [pageW, pageH],
    compress: true,
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

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(muted);
    const meta = [
      `${seq.items.length} poses`,
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
  let row = 0;

  for (let i = 0; i < seq.items.length; i++) {
    const it = seq.items[i];
    const text = cardText[i];
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
              h,
              undefined,
              "FAST"
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

    // Name — wraps onto up to three lines, space is reserved by the row height
    doc.setFont("helvetica", "normal");
    doc.setFontSize(nameSize);
    doc.setTextColor(ink);
    text.nameLines.forEach((ln, li) => {
      doc.text(ln, x + cardW / 2, y + imgH + labelTop + li * nameLead, {
        align: "center",
      });
    });

    // Side marker (no durations — sequences focus on order and cues)
    let ty = y + imgH + labelTop + text.nameLines.length * nameLead;
    if (it.side) {
      doc.setFontSize(sideSize);
      doc.setTextColor(muted);
      doc.text(it.side, x + cardW / 2, ty, { align: "center" });
      ty += sideLead;
    }

    // Pose note — small, light grey, directly under the name
    if (text.noteLines.length) {
      doc.setFontSize(noteSize);
      doc.setTextColor(150, 146, 138);
      text.noteLines.forEach((ln, li) => {
        doc.text(ln, x + cardW / 2, ty + li * noteLead, { align: "center" });
      });
    }

    col += 1;
    if (col === cols) {
      col = 0;
      y += imgH + rowLabelH[row] + gap;
      row += 1;
    }
  }


  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(muted);
  doc.text(INSTAGRAM, pageW / 2, pageH - 6, { align: "center" });


  doc.save(`${seq.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-grid.pdf`);
}
