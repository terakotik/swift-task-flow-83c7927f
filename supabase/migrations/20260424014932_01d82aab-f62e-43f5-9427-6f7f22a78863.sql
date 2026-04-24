-- Журнал удалений completed_tasks
CREATE TABLE public.deleted_completed_tasks_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  original_id uuid NOT NULL,
  task_id uuid NOT NULL,
  user_id uuid NOT NULL,
  order_number text NOT NULL,
  status text NOT NULL,
  reject_reason text,
  accepted_at timestamptz,
  completed_at timestamptz,
  original_created_at timestamptz NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  deleted_by uuid,
  restored boolean NOT NULL DEFAULT false,
  restored_at timestamptz
);

CREATE INDEX idx_deleted_ct_log_deleted_at ON public.deleted_completed_tasks_log (deleted_at DESC);
CREATE INDEX idx_deleted_ct_log_user ON public.deleted_completed_tasks_log (user_id);
CREATE INDEX idx_deleted_ct_log_restored ON public.deleted_completed_tasks_log (restored);

ALTER TABLE public.deleted_completed_tasks_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view deleted log"
ON public.deleted_completed_tasks_log
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update deleted log"
ON public.deleted_completed_tasks_log
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete from deleted log"
ON public.deleted_completed_tasks_log
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Триггер: при удалении строки из completed_tasks копируем её в журнал
CREATE OR REPLACE FUNCTION public.log_deleted_completed_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.deleted_completed_tasks_log (
    original_id, task_id, user_id, order_number, status, reject_reason,
    accepted_at, completed_at, original_created_at, deleted_by
  ) VALUES (
    OLD.id, OLD.task_id, OLD.user_id, OLD.order_number, OLD.status, OLD.reject_reason,
    OLD.accepted_at, OLD.completed_at, OLD.created_at, auth.uid()
  );
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_log_deleted_completed_task
BEFORE DELETE ON public.completed_tasks
FOR EACH ROW
EXECUTE FUNCTION public.log_deleted_completed_task();