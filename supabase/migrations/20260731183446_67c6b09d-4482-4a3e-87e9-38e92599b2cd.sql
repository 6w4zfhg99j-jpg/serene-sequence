CREATE TABLE public.pose_subcategories (
  pose_id uuid NOT NULL REFERENCES public.poses(id) ON DELETE CASCADE,
  subcategory_id uuid NOT NULL REFERENCES public.subcategories(id) ON DELETE CASCADE,
  PRIMARY KEY (pose_id, subcategory_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pose_subcategories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pose_subcategories TO authenticated;
GRANT ALL ON public.pose_subcategories TO service_role;

ALTER TABLE public.pose_subcategories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "open access pose_subcategories" ON public.pose_subcategories
  FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.pose_subcategories (pose_id, subcategory_id)
SELECT id, subcategory_id FROM public.poses WHERE subcategory_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE public.poses ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY name) - 1 AS rn FROM public.poses
)
UPDATE public.poses p SET sort_order = ordered.rn FROM ordered WHERE ordered.id = p.id;

CREATE INDEX IF NOT EXISTS idx_poses_sort_order ON public.poses(sort_order);