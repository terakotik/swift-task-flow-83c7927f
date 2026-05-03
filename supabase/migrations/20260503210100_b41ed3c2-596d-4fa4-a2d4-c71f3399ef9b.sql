
-- Обновляем заморозку: попадают только юзеры с >=10 заданиями и суммой >=200₽
CREATE OR REPLACE FUNCTION public.freeze_unpaid_batch()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  WITH per_user AS (
    SELECT ct.user_id,
      COUNT(*)::int AS cnt,
      SUM(CASE WHEN t.task_type = 'image' OR t.image_url IS NOT NULL THEN 30 ELSE 20 END)::numeric AS amt
    FROM public.completed_tasks ct
    JOIN public.tasks t ON t.id = ct.task_id
    WHERE ct.status = 'done' AND ct.held_at IS NULL
    GROUP BY ct.user_id
  ),
  eligible AS (
    SELECT user_id FROM per_user WHERE cnt >= 10 AND amt >= 200
  )
  UPDATE public.completed_tasks ct
     SET held_at = now()
   WHERE ct.status = 'done'
     AND ct.held_at IS NULL
     AND ct.user_id IN (SELECT user_id FROM eligible);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'frozen', v_count);
END;
$$;

-- Одноразовый откат: размораживаем всех, кто не подходит под пороги
WITH per_user AS (
  SELECT ct.user_id,
    COUNT(*)::int AS cnt,
    SUM(CASE WHEN t.task_type = 'image' OR t.image_url IS NOT NULL THEN 30 ELSE 20 END)::numeric AS amt
  FROM public.completed_tasks ct
  JOIN public.tasks t ON t.id = ct.task_id
  WHERE ct.status = 'done' AND ct.held_at IS NOT NULL
  GROUP BY ct.user_id
),
not_eligible AS (
  SELECT user_id FROM per_user WHERE cnt < 10 OR amt < 200
)
UPDATE public.completed_tasks
   SET held_at = NULL
 WHERE status = 'done'
   AND held_at IS NOT NULL
   AND user_id IN (SELECT user_id FROM not_eligible);
