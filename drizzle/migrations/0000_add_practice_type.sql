ALTER TABLE public.sequences ADD COLUMN IF NOT EXISTS practice_type text NOT NULL DEFAULT 'yoga';
CREATE INDEX IF NOT EXISTS idx_sequences_practice_type ON public.sequences(practice_type);