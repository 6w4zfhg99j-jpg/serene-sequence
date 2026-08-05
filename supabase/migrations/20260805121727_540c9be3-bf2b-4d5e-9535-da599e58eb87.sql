ALTER TABLE public.sequences ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_sequences_deleted_at ON public.sequences (deleted_at);