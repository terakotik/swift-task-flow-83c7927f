-- Добавляем поле restaurant_tag для группировки заданий по ресторанам/локациям
ALTER TABLE public.completed_tasks
ADD COLUMN IF NOT EXISTS restaurant_tag TEXT;

-- Индекс для быстрой фильтрации по тегу
CREATE INDEX IF NOT EXISTS idx_completed_tasks_restaurant_tag
  ON public.completed_tasks (restaurant_tag);