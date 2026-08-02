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


export type PdfLayout = "list" | "grid";

export async function exportSequencePdf(
  seq: Sequence,
  opts: { includeNotes: boolean; layout?: PdfLayout }
) {
  if ((opts.layout ?? "list") === "grid") {
    return exportSequenceGridPdf(seq);
  }
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const pageW = 210;
  const pageH = 297;
  const margin = 16;
  const ink = "#2a2620";
  const muted = "#6b665e";

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
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(muted);
  doc.text(BRAND.toUpperCase(), margin, hy);

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
  const rowH = 38;
  const imgSize = 32;


  for (let i = 0; i < seq.items.length; i++) {
    const it = seq.items[i];
    if (y + rowH > pageH - margin) {
      doc.addPage();
      y = margin;
    }

    // Number
    doc.setFont("times", "italic");
    doc.setFontSize(16);
    doc.setTextColor(muted);
    doc.text(String(i + 1).padStart(2, "0"), margin, y + 8);

    // Image
    const url = resolve(it.pose.image_url);
    const x = margin + 12;
    if (url) {
      const img = loaded.get(url) ?? null;
      if (img) {
        const ratio = img.w / img.h;
        let w = imgSize;
        let h = imgSize;
        if (ratio > 1) h = imgSize / ratio;
        else w = imgSize * ratio;
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
      }
    }
    doc.setDrawColor(230, 226, 218);
    doc.rect(x, y, imgSize, imgSize);

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
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(muted);
    doc.text(`${seq.title}`, margin, pageH - 8);
    doc.text(`${p} / ${pageCount}`, pageW - margin, pageH - 8, { align: "right" });
  }

  doc.save(`${seq.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`);
}

export async function exportSequenceGridPdf(seq: Sequence) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = 210;
  const pageH = 297;
  const margin = 12;
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

  // Grid metrics
  const cols = 5;
  const gap = 4;
  const cardW = (pageW - margin * 2 - gap * (cols - 1)) / cols;
  const imgH = cardW;
  const labelH = 9;
  const cardH = imgH + labelH;

  const headerH = 18;
  const footerH = 10;
  const firstTop = margin + headerH;
  const restTop = margin + 6;

  function drawHeader(page: number) {
    if (page === 1) {
      doc.setFont("times", "italic");
      doc.setFontSize(20);
      doc.setTextColor(ink);
      doc.text(seq.title, margin, margin + 6);

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
      doc.text(meta, margin, margin + 11);
      doc.setDrawColor(220, 216, 208);
      doc.line(margin, margin + 14, pageW - margin, margin + 14);
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(muted);
      doc.text(seq.title, margin, margin + 2);
      doc.setDrawColor(230, 226, 218);
      doc.line(margin, margin + 4, pageW - margin, margin + 4);
    }
  }

  let page = 1;
  drawHeader(page);
  let y = firstTop;
  let col = 0;

  for (let i = 0; i < seq.items.length; i++) {
    if (col === 0 && y + cardH > pageH - margin - footerH) {
      doc.addPage();
      page += 1;
      drawHeader(page);
      y = restTop;
    }

    const it = seq.items[i];
    const x = margin + col * (cardW + gap);

    // Image box
    doc.setDrawColor(230, 226, 218);
    doc.setFillColor(250, 249, 246);
    doc.rect(x, y, cardW, imgH, "FD");

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
      }
    }

    // Index badge
    doc.setFont("times", "italic");
    doc.setFontSize(8);
    doc.setTextColor(muted);
    doc.text(String(i + 1).padStart(2, "0"), x + 1.5, y + 4.5);

    // Name
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(ink);
    const nameLines = doc
      .splitTextToSize(it.pose.name, cardW - 1)
      .slice(0, 2) as string[];
    nameLines.forEach((ln, li) => {
      doc.text(ln, x + cardW / 2, y + imgH + 3.5 + li * 3, { align: "center" });
    });

    // Duration / side
    const dur = it.duration_seconds ?? it.pose.duration_seconds;
    const bits: string[] = [];
    if (dur) bits.push(formatDuration(dur));
    if (it.side) bits.push(it.side);
    if (bits.length) {
      doc.setFontSize(6.5);
      doc.setTextColor(muted);
      doc.text(bits.join(" · "), x + cardW / 2, y + imgH + 3.5 + nameLines.length * 3, {
        align: "center",
      });
    }

    col += 1;
    if (col === cols) {
      col = 0;
      y += cardH + gap;
    }
  }

  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(muted);
    doc.text(`${p} / ${pageCount}`, pageW - margin, pageH - 6, { align: "right" });
  }

  doc.save(`${seq.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-grid.pdf`);
}
