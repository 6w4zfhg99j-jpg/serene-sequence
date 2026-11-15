import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { createSequence } from "@/lib/yoga-api";
import { usePractice } from "@/lib/practice-context";
import { Loader2 } from "lucide-react";
import { PracticeToggle } from "@/components/PracticeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Create a sequence — VONA Sequence Designer" },
      {
        name: "description",
        content:
          "Name your practice and start building a yoga sequence pose by pose in VONA.",
      },
      { property: "og:title", content: "Create a sequence — VONA" },
      {
        property: "og:description",
        content: "Name your practice and start building a yoga sequence in VONA.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BuilderStart,
});

function BuilderStart() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const t = useT();
  const [title, setTitle] = useState("");
  const { practice, setPractice } = usePractice();
  const create = useMutation({
    mutationFn: () => createSequence({ title: title.trim() || t("home.untitled"), practice_type: practice }),
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
      <PracticeToggle value={practice} onChange={setPractice} className="mt-6" />
      <form className="mt-4 flex w-full flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (!create.isPending) create.mutate(); }}>
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("home.titlePlaceholder")}
          className="text-center"
          aria-label={t("builder.nameHeading")}
        />
        <Button type="submit" size="lg" disabled={create.isPending}>
          {create.isPending && <Loader2 className="size-4 animate-spin" />}
          {t("builder.start")}
        </Button>
        {create.isError && <p role="alert" className="text-sm text-destructive">{t("sequence.saveFailed")}</p>}
      </form>
    </div>
  );
}
