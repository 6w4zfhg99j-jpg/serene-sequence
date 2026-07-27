import { useQuery } from "@tanstack/react-query";
import { getSignedImageUrls } from "@/lib/yoga-api";

function isRemotePath(p: string): boolean {
  // http(s), data URLs, or Electron custom protocol are served directly
  return (
    p.startsWith("http") ||
    p.startsWith("data:") ||
    p.startsWith("blob:") ||
    p.startsWith("local://") ||
    p.startsWith("file://")
  );
}

export function useSignedImages(paths: (string | null | undefined)[]) {
  const list = paths.filter((p): p is string => !!p && !isRemotePath(p));
  const key = list.slice().sort().join("|");
  return useQuery({
    queryKey: ["signed-images", key],
    queryFn: () => getSignedImageUrls(list),
    staleTime: 60 * 60 * 1000,
    enabled: list.length > 0,
  });
}

export function resolveImage(
  path: string | null | undefined,
  map: Record<string, string> | undefined,
): string | null {
  if (!path) return null;
  if (isRemotePath(path)) return path;
  return map?.[path] ?? null;
}
