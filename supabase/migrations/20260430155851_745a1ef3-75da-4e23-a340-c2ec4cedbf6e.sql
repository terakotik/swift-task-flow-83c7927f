
-- Таблица заявок на выплату
CREATE TABLE IF NOT EXISTS public.payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('sbp','usdt_trc20')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  comment text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','rejected')),
  reject_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processed_by uuid
);

CREATE INDEX IF NOT EXISTS idx_payout_requests_user ON public.payout_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payout_requests_status ON public.payout_requests(status, created_at DESC);

ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own payout requests"
  ON public.payout_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all payout requests"
  ON public.payout_requests FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update payout requests"
  ON public.payout_requests FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete payout requests"
  ON public.payout_requests FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- INSERT не разрешаем напрямую — только через RPC

-- RPC: создать заявку
CREATE OR REPLACE FUNCTION public.create_payout_request(
  _amount numeric,
  _method text,
  _details jsonb,
  _comment text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_balance numeric;
  v_pending int;
  v_request_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  IF _amount IS NULL OR _amount < 500 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'min_amount', 'min', 500);
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

  -- Замораживаем: списываем с баланса
  PERFORM set_config('app.balance_change_reason', 'Заявка на выплату', true);
  UPDATE public.profiles SET balance = balance - _amount WHERE user_id = v_user;

  INSERT INTO public.payout_requests (user_id, amount, method, details, comment)
  VALUES (v_user, _amount, _method, COALESCE(_details, '{}'::jsonb), NULLIF(trim(_comment),''))
  RETURNING id INTO v_request_id;

  RETURN jsonb_build_object('ok', true, 'id', v_request_id);
END;
$$;

-- RPC: подтвердить выплату (админ)
CREATE OR REPLACE FUNCTION public.approve_payout_request(_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.payout_requests%ROWTYPE;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_req FROM public.payout_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_req.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending');
  END IF;

  UPDATE public.payout_requests
    SET status = 'paid', processed_at = now(), processed_by = auth.uid()
  WHERE id = _request_id;

  -- Запись в историю баланса (без изменения, как событие)
  INSERT INTO public.balance_history (user_id, old_balance, new_balance, delta, reason, changed_by)
  SELECT v_req.user_id, p.balance, p.balance, 0,
         'Выплата подтверждена: ' || v_req.amount::text || '₽',
         auth.uid()
  FROM public.profiles p WHERE p.user_id = v_req.user_id;

  -- Помечаем выполненные задания как оплаченные (которые ещё done)
  UPDATE public.completed_tasks
    SET status = 'paid'
  WHERE user_id = v_req.user_id AND status = 'done';

  -- Триггер первой выплаты для рефералки
  PERFORM public.process_referral_payout(v_req.user_id);

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- RPC: отклонить заявку (админ) — возврат денег
CREATE OR REPLACE FUNCTION public.reject_payout_request(_request_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.payout_requests%ROWTYPE;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_req FROM public.payout_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_req.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending');
  END IF;

  -- Возвращаем деньги
  PERFORM set_config('app.balance_change_reason', 'Возврат: отклонена заявка на выплату', true);
  UPDATE public.profiles SET balance = balance + v_req.amount WHERE user_id = v_req.user_id;

  UPDATE public.payout_requests
    SET status = 'rejected',
        processed_at = now(),
        processed_by = auth.uid(),
        reject_reason = NULLIF(trim(_reason), '')
  WHERE id = _request_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;
