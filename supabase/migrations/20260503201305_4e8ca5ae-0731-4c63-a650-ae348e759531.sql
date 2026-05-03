ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS payout_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payout_hold_at timestamptz,
  ADD COLUMN IF NOT EXISTS payout_hold_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payout_hold_with_image integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payout_hold_no_image integer NOT NULL DEFAULT 0;