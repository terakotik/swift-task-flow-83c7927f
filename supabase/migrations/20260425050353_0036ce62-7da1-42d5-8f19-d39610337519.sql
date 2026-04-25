-- Ensure balance_history trigger is attached to profiles
DROP TRIGGER IF EXISTS trg_log_balance_change ON public.profiles;
CREATE TRIGGER trg_log_balance_change
AFTER UPDATE OF balance ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.log_balance_change();

-- RPC: admin adjusts user balance with a reason that is recorded in balance_history
CREATE OR REPLACE FUNCTION public.admin_adjust_balance(_user_id uuid, _delta numeric, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old numeric;
  v_new numeric;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF _delta = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'zero_delta');
  END IF;

  SELECT balance INTO v_old FROM public.profiles WHERE user_id = _user_id;
  IF v_old IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  v_new := v_old + _delta;
  IF v_new < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'negative_balance');
  END IF;

  PERFORM set_config('app.balance_change_reason', COALESCE(NULLIF(trim(_reason), ''), 'Ручная корректировка'), true);

  UPDATE public.profiles SET balance = v_new WHERE user_id = _user_id;

  RETURN jsonb_build_object('ok', true, 'old_balance', v_old, 'new_balance', v_new);
END;
$$;

-- Allow users to view their own balance_history (already exists per RLS, but ensure)
-- Policies already in place: "Users view own balance history" and "Admins view all balance history"
