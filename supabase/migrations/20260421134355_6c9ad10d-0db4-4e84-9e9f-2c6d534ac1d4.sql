UPDATE completed_tasks 
SET status = 'paid' 
WHERE status = 'done' 
  AND user_id IN (SELECT user_id FROM profiles WHERE balance = 0);