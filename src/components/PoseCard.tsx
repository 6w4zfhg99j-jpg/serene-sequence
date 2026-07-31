import { Heart, Plus } from "lucide-react";
import type { Pose } from "@/lib/yoga-api";
import { PoseImage } from "./PoseImage";

interface Props {
  pose: Pose;
  onClick?: () => void;
  onFavorite?: () => void;
  onAdd?: () => void;
  compact?: boolean;
  dense?: boolean;
}

export function PoseCard({ pose, onClick, onFavorite, onAdd, compact, dense }: Props) {
  // Dense mode: minimal browsing card — small thumbnail, name only, tight grid.
  if (dense) {
    return (
      <div
        className={
          "group relative flex flex-col overflow-hidden rounded-lg border border-line bg-surface transition-all hover:border-ink-subtle hover:shadow-sm " +
          (onClick ? "cursor-pointer" : "")
        }
        onClick={onClick}
      >
        <div className="relative aspect-square">
          <PoseImage
            path={pose.image_url}
            alt={pose.name}
            className="size-full object-cover"
          />
          {onFavorite && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onFavorite();
              }}
              className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-background/85 backdrop-blur-sm transition-colors hover:bg-background"
              aria-label="Favorite"
            >
              <Heart
                className={
                  "size-3 " +
                  (pose.is_favorite ? "fill-accent text-accent" : "text-ink-muted")
                }
                strokeWidth={1.75}
              />
            </button>
          )}
          {onAdd && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAdd();
              }}
              className="absolute bottom-1 right-1 flex size-7 items-center justify-center rounded-full bg-ink text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100"
              aria-label="Add to sequence"
            >
              <Plus className="size-3.5" />
            </button>
          )}
        </div>
        <div className="px-2 py-1.5">
          <h3 className="truncate text-xs font-medium leading-tight" title={pose.name}>
            {pose.name}
          </h3>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        "group relative flex flex-col overflow-hidden rounded-xl border border-line bg-surface transition-all hover:border-ink-subtle hover:shadow-sm " +
        (onClick ? "cursor-pointer" : "")
      }
      onClick={onClick}
    >
      <div className="relative aspect-square">
        <PoseImage
          path={pose.image_url}
          alt={pose.name}
          className="size-full object-cover"
        />
        {onFavorite && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFavorite();
            }}
            className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-background/85 backdrop-blur-sm transition-colors hover:bg-background"
            aria-label="Favorite"
          >
            <Heart
              className={
                "size-4 " +
                (pose.is_favorite ? "fill-accent text-accent" : "text-ink-muted")
              }
              strokeWidth={1.75}
            />
          </button>
        )}
        {onAdd && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAdd();
            }}
            className="absolute bottom-2 right-2 flex size-9 items-center justify-center rounded-full bg-ink text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100"
            aria-label="Add to sequence"
          >
            <Plus className="size-4" />
          </button>
        )}
      </div>
      <div className={compact ? "p-2.5" : "p-3"}>
        <h3 className={"leading-tight " + (compact ? "text-sm font-medium" : "font-serif text-lg")}>
          {pose.name}
        </h3>
        {pose.sanskrit_name && !compact && (
          <p className="mt-0.5 text-xs italic text-ink-muted">{pose.sanskrit_name}</p>
        )}
        {!compact && (
          <div className="mt-2 flex flex-wrap gap-1">
            {pose.categories.slice(0, 2).map((c) => (
              <span
                key={c.id}
                className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-ink-muted ring-1 ring-line"
              >
                {c.name}
              </span>
            ))}
            {pose.tags.slice(0, 3).map((t) => (
              <span key={t.id} className="text-[10px] text-accent">
                #{t.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
