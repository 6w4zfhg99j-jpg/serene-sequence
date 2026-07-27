
-- Categories
CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO anon, authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open access categories" ON public.categories FOR ALL USING (true) WITH CHECK (true);

-- Tags
CREATE TABLE public.tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO anon, authenticated;
GRANT ALL ON public.tags TO service_role;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open access tags" ON public.tags FOR ALL USING (true) WITH CHECK (true);

-- Poses
CREATE TABLE public.poses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  sanskrit_name TEXT,
  description TEXT,
  duration_seconds INT,
  difficulty TEXT NOT NULL DEFAULT 'beginner',
  image_url TEXT,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.poses TO anon, authenticated;
GRANT ALL ON public.poses TO service_role;
ALTER TABLE public.poses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open access poses" ON public.poses FOR ALL USING (true) WITH CHECK (true);

-- Pose categories junction
CREATE TABLE public.pose_categories (
  pose_id UUID NOT NULL REFERENCES public.poses(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  PRIMARY KEY (pose_id, category_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pose_categories TO anon, authenticated;
GRANT ALL ON public.pose_categories TO service_role;
ALTER TABLE public.pose_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open access pose_categories" ON public.pose_categories FOR ALL USING (true) WITH CHECK (true);

-- Pose tags junction
CREATE TABLE public.pose_tags (
  pose_id UUID NOT NULL REFERENCES public.poses(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (pose_id, tag_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pose_tags TO anon, authenticated;
GRANT ALL ON public.pose_tags TO service_role;
ALTER TABLE public.pose_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open access pose_tags" ON public.pose_tags FOR ALL USING (true) WITH CHECK (true);

-- Sequences
CREATE TABLE public.sequences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  level TEXT NOT NULL DEFAULT 'all-levels',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sequences TO anon, authenticated;
GRANT ALL ON public.sequences TO service_role;
ALTER TABLE public.sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open access sequences" ON public.sequences FOR ALL USING (true) WITH CHECK (true);

-- Sequence tags
CREATE TABLE public.sequence_tags (
  sequence_id UUID NOT NULL REFERENCES public.sequences(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (sequence_id, tag_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sequence_tags TO anon, authenticated;
GRANT ALL ON public.sequence_tags TO service_role;
ALTER TABLE public.sequence_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open access sequence_tags" ON public.sequence_tags FOR ALL USING (true) WITH CHECK (true);

-- Sequence poses (ordered items)
CREATE TABLE public.sequence_poses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sequence_id UUID NOT NULL REFERENCES public.sequences(id) ON DELETE CASCADE,
  pose_id UUID NOT NULL REFERENCES public.poses(id) ON DELETE CASCADE,
  position INT NOT NULL,
  notes TEXT,
  duration_seconds INT,
  side TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sequence_poses_sequence_pos_idx ON public.sequence_poses(sequence_id, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sequence_poses TO anon, authenticated;
GRANT ALL ON public.sequence_poses TO service_role;
ALTER TABLE public.sequence_poses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open access sequence_poses" ON public.sequence_poses FOR ALL USING (true) WITH CHECK (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER poses_updated_at BEFORE UPDATE ON public.poses
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER sequences_updated_at BEFORE UPDATE ON public.sequences
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed default categories
INSERT INTO public.categories (name, sort_order) VALUES
  ('Warm-up', 10),
  ('Standing', 20),
  ('Balance', 30),
  ('Forward Bends', 40),
  ('Backbends', 50),
  ('Twists', 60),
  ('Hip Openers', 70),
  ('Core', 80),
  ('Arm Balances', 90),
  ('Inversions', 100),
  ('Prone', 110),
  ('Supine', 120),
  ('Cool Down', 130),
  ('Relaxation', 140),
  ('Breathing', 150),
  ('Meditation', 160);

-- Seed common tags
INSERT INTO public.tags (name) VALUES
  ('hamstrings'), ('hips'), ('shoulders'), ('spine'),
  ('strength'), ('flexibility'), ('beginner'), ('advanced'),
  ('pregnancy'), ('restorative');
