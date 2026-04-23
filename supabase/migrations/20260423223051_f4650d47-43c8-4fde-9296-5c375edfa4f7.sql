CREATE POLICY "Admins can delete completed tasks"
ON public.completed_tasks
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'::public.app_role));