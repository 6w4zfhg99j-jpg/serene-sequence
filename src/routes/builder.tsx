import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { createSequence } from "@/lib/yoga-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/builder")({
  head: () => ({
    meta: [
      { title: "New sequence — VONA" },
      { name: "description", content: "Start a new yoga sequence." },
      { property: "og:title", content: "New sequence — VONA" },
      { property: "og:description", content: "Start a new yoga sequence." },
    ],
  }),
  component: BuilderStart,
});

function BuilderStart() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const t = useT();
  const [title, setTitle] = useState("");
  const create = useMutation({
    mutationFn: () => createSequence({ title: title.trim() || t("home.untitled") }),
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["sequences"] });
      nav({ to: "/sequences/$id", params: { id } });
    },
  });

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <p className="label-eyebrow">{t("builder.eyebrow")}</p>
      <h1 className="mt-2 font-serif text-4xl">{t("builder.nameHeading")}</h1>
      <p className="mt-2 text-sm text-ink-muted">{t("builder.nameHint")}</p>
      <div className="mt-6 flex w-full flex-col gap-3">
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("home.titlePlaceholder")}
          className="text-center"
          onKeyDown={(e) => e.key === "Enter" && create.mutate()}
        />
        <Button size="lg" onClick={() => create.mutate()} disabled={create.isPending}>
          {t("builder.start")}
        </Button>
      </div>
    </div>
  );
}
