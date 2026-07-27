import { useQuery } from "@tanstack/react-query";
import { getSignedImageUrls } from "@/lib/yoga-api";

export function useSignedImages(paths: (string | null | undefined)[]) {
  const list = paths.filter((p): p is string => !!p && !p.startsWith("http"));
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
  map: Record<string, string> | undefined
): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return map?.[path] ?? null;
}
