-- ============================================================
-- 1. РЕФЕРАЛЬНАЯ СИСТЕМА + ЛОГ БАЛАНСОВ
-- ============================================================

-- 1.1 Колонки в profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by uuid,
  ADD COLUMN IF NOT EXISTS first_payout_at timestamptz;

-- 1.2 Генератор реф-кода (6 символов A-Z0-9, исключая похожие 0/O/1/I)
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  exists_check int;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..6 LOOP
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    SELECT count(*) INTO exists_check FROM public.profiles WHERE referral_code = code;
    EXIT WHEN exists_check = 0;
  END LOOP;
  RETURN code;
END;
$$;

-- 1.3 Backfill кодов для существующих профилей
UPDATE public.profiles
SET referral_code = public.generate_referral_code()
WHERE referral_code IS NULL;

-- 1.4 Обновлённый handle_new_user — автогенерация кода + сохранение реферера из metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ref_code text;
  ref_user_id uuid;
BEGIN
  -- Если в metadata есть referral_code — найти реферера
  ref_code := NEW.raw_user_meta_data->>'referral_code';
  IF ref_code IS NOT NULL AND ref_code != '' THEN
    SELECT user_id INTO ref_user_id FROM public.profiles WHERE referral_code = upper(ref_code);
  END IF;

  INSERT INTO public.profiles (user_id, display_name, email, referral_code, referred_by)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
    NEW.email,
    public.generate_referral_code(),
    ref_user_id
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;

-- ============================================================
-- 2. ЛОГ РЕФЕРАЛЬНЫХ НАГРАД
-- ============================================================
CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL,
  referred_id uuid NOT NULL UNIQUE, -- защита: одно начисление за друга
  amount numeric NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own referral rewards"
  ON public.referral_rewards FOR SELECT
  USING (auth.uid() = referrer_id);

CREATE POLICY "Admins view all referral rewards"
  ON public.referral_rewards FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- 3. ЛОГ ВСЕХ ИЗМЕНЕНИЙ БАЛАНСА (для будущего восстановления)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.balance_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  old_balance numeric NOT NULL,
  new_balance numeric NOT NULL,
  delta numeric NOT NULL,
  reason text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_balance_history_user ON public.balance_history(user_id, created_at DESC);

ALTER TABLE public.balance_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own balance history"
  ON public.balance_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all balance history"
  ON public.balance_history FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Триггер: логирует каждое изменение balance
CREATE OR REPLACE FUNCTION public.log_balance_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.balance IS DISTINCT FROM NEW.balance THEN
    INSERT INTO public.balance_history (user_id, old_balance, new_balance, delta, reason, changed_by)
    VALUES (
      NEW.user_id,
      OLD.balance,
      NEW.balance,
      NEW.balance - OLD.balance,
      current_setting('app.balance_change_reason', true),
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_balance_change ON public.profiles;
CREATE TRIGGER trg_log_balance_change
  AFTER UPDATE OF balance ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.log_balance_change();

-- ============================================================
-- 4. RPC: обработка реферальной выплаты (вызывается после resetBalance)
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_referral_payout(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_referrer uuid;
  v_first_payout timestamptz;
  v_reward_amount numeric := 30;
BEGIN
  -- Только админ может вызвать
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT referred_by, first_payout_at
    INTO v_referrer, v_first_payout
  FROM public.profiles
  WHERE user_id = _user_id;

  -- Уже была первая выплата — ничего не делаем
  IF v_first_payout IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'already_paid_before');
  END IF;

  -- Помечаем первую выплату
  UPDATE public.profiles
    SET first_payout_at = now()
  WHERE user_id = _user_id;

  -- Нет реферера — выходим
  IF v_referrer IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'no_referrer');
  END IF;

  -- Защита от дубля + лог
  BEGIN
    INSERT INTO public.referral_rewards (referrer_id, referred_id, amount)
    VALUES (v_referrer, _user_id, v_reward_amount);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'already_rewarded');
  END;

  -- Начисляем 30₽ рефереру с пометкой в лог балансов
  PERFORM set_config('app.balance_change_reason', 'referral_bonus:' || _user_id::text, true);
  UPDATE public.profiles
    SET balance = balance + v_reward_amount
  WHERE user_id = v_referrer;

  RETURN jsonb_build_object('ok', true, 'rewarded', v_referrer, 'amount', v_reward_amount);
END;
$$;

-- ============================================================
-- 5. RPC: получить публичную инфу по реф-коду (для регистрации)
-- ============================================================
CREATE OR REPLACE FUNCTION public.lookup_referrer(_code text)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'found', count(*) > 0,
    'name', max(display_name)
  )
  FROM public.profiles
  WHERE referral_code = upper(_code);
$$;