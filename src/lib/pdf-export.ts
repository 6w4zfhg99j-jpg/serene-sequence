import { jsPDF } from "jspdf";
import { getSignedImageUrls, formatDuration, type Sequence } from "@/lib/yoga-api";

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

function decode(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Loads an image (http, data:, or Electron local://) and re-encodes it through
 * a canvas to PNG so jsPDF always receives a format it can embed. Awaiting the
 * decode guarantees the bitmap is ready before it is drawn into the PDF.
 */
async function loadImageAsDataUrl(url: string): Promise<LoadedImage | null> {
  if (imageCache.has(url)) return imageCache.get(url) ?? null;
  let result: LoadedImage | null = null;
  try {
    let src = url;
    if (!url.startsWith("data:")) {
      // fetch() works for http and for the privileged local:// scheme
      // (registered with supportFetchAPI) and sidesteps canvas tainting.
      try {
        const res = await fetch(url);
        if (res.ok) {
          const blob = await res.blob();
          src = await new Promise<string>((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result as string);
            fr.onerror = reject;
            fr.readAsDataURL(blob);
          });
        }
      } catch {
        // fall back to loading the URL directly in an <img>
      }
    }
    const img = await decode(src);
    if (img && img.naturalWidth > 0) {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        try {
          result = {
            dataUrl: canvas.toDataURL("image/png"),
            format: "PNG",
            w: img.naturalWidth,
            h: img.naturalHeight,
          };
        } catch {
          // tainted canvas — use the source data directly if it is a data URL
          if (src.startsWith("data:")) {
            result = {
              dataUrl: src,
              format: src.startsWith("data:image/png") ? "PNG" : "JPEG",
              w: img.naturalWidth,
              h: img.naturalHeight,
            };
          }
        }
      }
    }
  } catch {
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

  // Header
  doc.setTextColor(ink);
  doc.setFont("times", "italic");
  doc.setFontSize(28);
  doc.text(seq.title, margin, margin + 6);

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
  doc.text(meta, margin, margin + 12);

  if (seq.description) {
    doc.setFontSize(10);
    doc.setTextColor(ink);
    const lines = doc.splitTextToSize(seq.description, pageW - margin * 2);
    doc.text(lines, margin, margin + 20);
  }

  doc.setDrawColor(220, 216, 208);
  doc.line(margin, margin + 26, pageW - margin, margin + 26);

  let y = margin + 34;
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
    const path = it.pose.image_url;
    const url = path
      ? path.startsWith("http")
        ? path
        : signed[path]
      : null;
    const x = margin + 12;
    if (url) {
      const img = await loadImageAsDataUrl(url);
      if (img) {
        const ratio = img.w / img.h;
        let w = imgSize;
        let h = imgSize;
        if (ratio > 1) h = imgSize / ratio;
        else w = imgSize * ratio;
        try {
          doc.addImage(
            img.dataUrl,
            "JPEG",
            x + (imgSize - w) / 2,
            y + (imgSize - h) / 2,
            w,
            h
          );
        } catch {}
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

  const paths = seq.items
    .map((it) => it.pose.image_url)
    .filter((p): p is string => !!p && !p.startsWith("http"));
  const signed = await getSignedImageUrls(paths);

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

    const path = it.pose.image_url;
    const url = path ? (path.startsWith("http") ? path : signed[path]) : null;
    if (url) {
      const img = await loadImageAsDataUrl(url);
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
            "JPEG",
            x + (cardW - w) / 2,
            y + (imgH - h) / 2,
            w,
            h
          );
        } catch {}
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
