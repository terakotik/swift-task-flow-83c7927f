CREATE OR REPLACE FUNCTION public.admin_complete_task(_completed_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_task_id uuid;
  v_has_image boolean;
  v_task_type text;
  v_price numeric;
  v_updated int;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.completed_tasks
     SET status = 'done',
         completed_at = COALESCE(completed_at, now())
   WHERE id = _completed_id
     AND status NOT IN ('done', 'paid')
  RETURNING user_id, task_id INTO v_user_id, v_task_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'already_done_or_missing');
  END IF;

  SELECT
    (image_url IS NOT NULL AND length(trim(image_url)) > 0),
    task_type
    INTO v_has_image, v_task_type
  FROM public.tasks
  WHERE id = v_task_id;

  v_price := CASE
    WHEN v_task_type = 'reels' THEN 200
    WHEN COALESCE(v_has_image, false) THEN 30
    ELSE 20
  END;

  PERFORM set_config('app.balance_change_reason',
    'Подтверждение задания ' || _completed_id::text, true);

  UPDATE public.profiles
     SET balance = balance + v_price
   WHERE user_id = v_user_id;

  RETURN jsonb_build_object('ok', true, 'credited', v_price);
END;
$$;