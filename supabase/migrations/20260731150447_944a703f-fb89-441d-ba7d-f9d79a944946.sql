CREATE TABLE public.folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  parent_id uuid REFERENCES public.folders(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.folders TO anon, authenticated;
GRANT ALL ON public.folders TO service_role;

ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "open access folders" ON public.folders FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER folders_set_updated_at BEFORE UPDATE ON public.folders
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.sequences
  ADD COLUMN folder_id uuid REFERENCES public.folders(id) ON DELETE SET NULL;

CREATE INDEX idx_sequences_folder ON public.sequences(folder_id);
CREATE INDEX idx_folders_parent ON public.folders(parent_id);