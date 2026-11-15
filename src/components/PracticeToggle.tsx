import type { PracticeType } from "@/lib/yoga-api";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export const PRACTICE_TYPES: PracticeType[] = ["yoga", "stretching"];

/** Segmented Yoga / Stretching switch, shared by Create and Saved screens. */
export function PracticeToggle({
  value,
  onChange,
  className = "",
}: {
  value: PracticeType;
  onChange: (v: PracticeType) => void;
  className?: string;
}) {
  const t = useT();
  return (
    <div
      role="tablist"
      className={"inline-flex rounded-lg border border-line bg-surface p-1 " + className}
    >
      {PRACTICE_TYPES.map((p) => (
        <Button
          key={p}
          type="button"
          role="tab"
          variant="ghost"
          aria-selected={value === p}
          onClick={() => onChange(p)}
          className={
            "rounded-md px-4 py-1.5 text-sm transition-colors " +
            (value === p ? "bg-ink text-background" : "text-ink-muted hover:text-ink")
          }
        >
          {t(p === "yoga" ? "practice.yoga" : "practice.stretching")}
        </Button>
      ))}
    </div>
  );
}
