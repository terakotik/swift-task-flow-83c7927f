
-- 1. Удалить дубликаты, оставив самую раннюю запись по (task_id, user_id, order_number)
DELETE FROM public.completed_tasks a
USING public.completed_tasks b
WHERE a.task_id = b.task_id
  AND a.user_id = b.user_id
  AND a.order_number = b.order_number
  AND a.created_at > b.created_at;

-- На случай одинакового created_at — оставить минимальный id
DELETE FROM public.completed_tasks a
USING public.completed_tasks b
WHERE a.task_id = b.task_id
  AND a.user_id = b.user_id
  AND a.order_number = b.order_number
  AND a.created_at = b.created_at
  AND a.id > b.id;

-- 2. Уникальный индекс, чтобы повторные вставки одной и той же заявки были невозможны
CREATE UNIQUE INDEX IF NOT EXISTS completed_tasks_unique_submission
  ON public.completed_tasks (task_id, user_id, order_number);
