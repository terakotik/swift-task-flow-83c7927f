CREATE TABLE public.order_issue_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  problem_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  resolved_by UUID NULL,
  resolved_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.order_issue_reports ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_order_issue_reports_task_id ON public.order_issue_reports(task_id);
CREATE INDEX idx_order_issue_reports_user_id ON public.order_issue_reports(user_id);
CREATE INDEX idx_order_issue_reports_status_created_at ON public.order_issue_reports(status, created_at DESC);

CREATE POLICY "Users can create own order issue reports"
ON public.order_issue_reports
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own order issue reports"
ON public.order_issue_reports
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all order issue reports"
ON public.order_issue_reports
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update order issue reports"
ON public.order_issue_reports
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete order issue reports"
ON public.order_issue_reports
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));