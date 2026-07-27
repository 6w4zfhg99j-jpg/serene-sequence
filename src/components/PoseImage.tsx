import { ImageIcon } from "lucide-react";
import { resolveImage, useSignedImages } from "@/hooks/use-signed-images";

interface Props {
  path: string | null | undefined;
  alt: string;
  className?: string;
}

export function PoseImage({ path, alt, className }: Props) {
  const { data } = useSignedImages([path]);
  const url = resolveImage(path, data);
  if (url) {
    return <img src={url} alt={alt} className={className} loading="lazy" />;
  }
  return (
    <div
      className={
        "flex items-center justify-center bg-surface text-ink-subtle " + (className ?? "")
      }
    >
      <ImageIcon className="size-6" strokeWidth={1.5} />
    </div>
  );
}
