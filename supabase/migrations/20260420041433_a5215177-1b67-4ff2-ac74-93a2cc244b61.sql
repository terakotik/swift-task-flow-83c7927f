-- Add new columns for image-type tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS task_type text NOT NULL DEFAULT 'text';

-- Make link/addr1/name nullable to support image-only tasks
ALTER TABLE public.tasks ALTER COLUMN link DROP NOT NULL;
ALTER TABLE public.tasks ALTER COLUMN addr1 DROP NOT NULL;
ALTER TABLE public.tasks ALTER COLUMN name DROP NOT NULL;

-- Create public bucket for task images
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-images', 'task-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Task images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'task-images');

CREATE POLICY "Admins can upload task images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'task-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update task images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'task-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete task images"
ON storage.objects FOR DELETE
USING (bucket_id = 'task-images' AND public.has_role(auth.uid(), 'admin'));