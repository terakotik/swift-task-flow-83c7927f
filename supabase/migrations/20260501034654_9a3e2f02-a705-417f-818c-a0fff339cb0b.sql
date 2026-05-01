-- Add fields for reels task descriptions and reference links
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS reference_link text;

-- Admin function: award reels view bonus (200₽), idempotent per completed_task
CREATE OR REPLACE FUNCTION public.admin_award_reels_bonus(_completed_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_bonus numeric := 200;
  v_already int;
  v_reason text;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT user_id INTO v_user_id FROM public.completed_tasks WHERE id = _completed_id;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  v_reason := 'reels_bonus:' || _completed_id::text;

  -- Idempotency: check balance_history for this exact reason
  SELECT count(*) INTO v_already
  FROM public.balance_history
  WHERE reason = v_reason;

  IF v_already > 0 THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'already_awarded');
  END IF;

  PERFORM set_config('app.balance_change_reason', v_reason, true);
  UPDATE public.profiles SET balance = balance + v_bonus WHERE user_id = v_user_id;

  RETURN jsonb_build_object('ok', true, 'credited', v_bonus);
END;
$$;