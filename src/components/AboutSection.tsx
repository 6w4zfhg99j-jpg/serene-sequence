import { useEffect, useRef, useState } from "react";
import { ImagePlus, Pencil, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

const TEXT_KEY = "vona.about.text";
const IMAGES_KEY = "vona.about.images";

const DEFAULT_TEXT = `VONA помогает создавать продуманные и эффективные последовательности за считанные минуты.

Вместо того чтобы тратить часы на планирование занятий, инструктор получает удобный визуальный конструктор с большой библиотекой асан, где можно быстро собрать практику под любую цель, уровень подготовки или стиль преподавания.

VONA не навязывает единую методику. Каждый преподаватель может полностью адаптировать приложение под свой подход:

• создавать собственные категории;
• добавлять теги;
• загружать свои асаны и фотографии;
• писать собственные описания и подсказки;
• формировать личную библиотеку последовательностей.

Это не просто каталог асан, а персональное рабочее пространство преподавателя йоги.

VONA — это первое приложение, которое становится продолжением методики самого преподавателя, а не заменяет её.`;

function readImages(): string[] {
  try {
    const raw = localStorage.getItem(IMAGES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((i) => typeof i === "string") : [];
  } catch {
    return [];
  }
}

/**
 * "About VONA" — editable presentation block. Text and photos are stored
 * locally (localStorage), so the content can be changed from inside the app
 * without touching the code, both in the browser and the desktop build.
 */
export function AboutSection() {
  const t = useT();
  const [text, setText] = useState(DEFAULT_TEXT);
  const [images, setImages] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem(TEXT_KEY);
    if (stored !== null) setText(stored);
    setImages(readImages());
  }, []);

  const save = () => {
    setText(draft);
    localStorage.setItem(TEXT_KEY, draft);
    setEditing(false);
  };

  const persistImages = (next: string[]) => {
    setImages(next);
    try {
      localStorage.setItem(IMAGES_KEY, JSON.stringify(next));
    } catch {
      /* quota — ignore */
    }
  };

  const onPick = async (files: FileList | null) => {
    if (!files?.length) return;
    const read = (file: File) =>
      new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(file);
      });
    const added: string[] = [];
    for (const file of Array.from(files)) {
      try {
        added.push(await read(file));
      } catch (err) {
        console.error("[about] failed to read image", err);
      }
    }
    persistImages([...images, ...added]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="label-eyebrow">{t("about.eyebrow")}</p>
          <h2 className="mt-1 font-serif text-3xl">{t("about.title")}</h2>
        </div>
        {!editing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft(text);
              setEditing(true);
            }}
          >
            <Pencil className="mr-1.5 size-3.5" strokeWidth={1.5} />
            {t("about.edit")}
          </Button>
        )}
      </div>

      {/* Photo area */}
      <div className="mb-7">
        {images.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {images.map((src, i) => (
              <div
                key={i}
                className="group relative overflow-hidden rounded-xl border border-line bg-background"
              >
                <img
                  src={src}
                  alt={`${t("about.title")} — ${i + 1}`}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />
                <button
                  type="button"
                  aria-label={t("about.removePhoto")}
                  onClick={() =>
                    persistImages(images.filter((_, idx) => idx !== i))
                  }
                  className="absolute right-2 top-2 rounded-full bg-surface/90 p-1.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" strokeWidth={1.5} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line text-ink-subtle transition-colors hover:border-ink-muted hover:text-ink-muted"
            >
              <ImagePlus className="size-5" strokeWidth={1.25} />
              <span className="text-xs">{t("about.addPhoto")}</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line px-6 py-12 text-ink-subtle transition-colors hover:border-ink-muted hover:text-ink-muted"
          >
            <ImagePlus className="size-6" strokeWidth={1.25} />
            <span className="text-sm">{t("about.photoPlaceholder")}</span>
            <span className="text-xs text-ink-subtle">{t("about.photoHint")}</span>
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => onPick(e.target.files)}
        />
      </div>

      {/* Content */}
      {editing ? (
        <div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={16}
            className="w-full resize-y rounded-xl border border-line bg-background p-4 text-sm leading-relaxed outline-none focus:border-ink-muted"
          />
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" onClick={save}>
              {t("about.save")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              <X className="mr-1.5 size-3.5" strokeWidth={1.5} />
              {t("about.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="max-w-3xl space-y-4">
          {paragraphs.map((p, i) => (
            <p
              key={i}
              className="whitespace-pre-line text-[15px] leading-relaxed text-ink-muted"
            >
              {p}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
