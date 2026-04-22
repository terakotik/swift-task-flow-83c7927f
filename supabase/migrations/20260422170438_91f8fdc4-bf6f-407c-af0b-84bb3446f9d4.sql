-- Удаляем неправильно добавленное поле из completed_tasks
DROP INDEX IF EXISTS public.idx_completed_tasks_restaurant_tag;
ALTER TABLE public.completed_tasks DROP COLUMN IF EXISTS restaurant_tag;

-- Добавляем поле restaurant_tag в таблицу tasks (групповая метка)
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS restaurant_tag TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_restaurant_tag
  ON public.tasks (restaurant_tag);