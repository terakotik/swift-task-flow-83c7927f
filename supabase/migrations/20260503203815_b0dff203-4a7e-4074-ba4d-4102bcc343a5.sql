
ALTER TABLE public.completed_tasks
  ADD COLUMN IF NOT EXISTS held_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_completed_tasks_held
  ON public.completed_tasks (user_id, status, held_at);

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

  UPDATE public.completed_tasks
     SET held_at = now()
   WHERE status = 'done'
     AND held_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'frozen', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_user_batch_paid(_user_id uuid)
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

  UPDATE public.completed_tasks
     SET status = 'paid'
   WHERE user_id = _user_id
     AND status = 'done'
     AND held_at IS NOT NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM public.process_referral_payout(_user_id);

  RETURN jsonb_build_object('ok', true, 'paid', v_count);
END;
$$;
