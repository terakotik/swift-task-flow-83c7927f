CREATE OR REPLACE FUNCTION public.create_payout_request(_amount numeric, _method text, _details jsonb, _comment text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_balance numeric;
  v_pending int;
  v_request_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  IF _amount IS NULL OR _amount < 200 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'min_amount', 'min', 200);
  END IF;
  IF _method NOT IN ('sbp','usdt_trc20') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_method');
  END IF;

  SELECT count(*) INTO v_pending
  FROM public.payout_requests
  WHERE user_id = v_user AND status = 'pending';

  IF v_pending > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pending_exists');
  END IF;

  SELECT balance INTO v_balance FROM public.profiles WHERE user_id = v_user;
  IF v_balance IS NULL OR v_balance < _amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'balance', COALESCE(v_balance,0));
  END IF;

  PERFORM set_config('app.balance_change_reason', 'Заявка на выплату', true);
  UPDATE public.profiles SET balance = balance - _amount WHERE user_id = v_user;

  INSERT INTO public.payout_requests (user_id, amount, method, details, comment)
  VALUES (v_user, _amount, _method, COALESCE(_details, '{}'::jsonb), NULLIF(trim(_comment),''))
  RETURNING id INTO v_request_id;

  RETURN jsonb_build_object('ok', true, 'id', v_request_id);
END;
$function$;