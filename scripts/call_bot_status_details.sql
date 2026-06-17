-- Paste into Supabase SQL Editor to inspect why calls are in retry.
-- Change campaign id below if needed.
select
  id,
  campaign_id,
  phone_number,
  status,
  attempts,
  last_attempt_at,
  next_attempt_at,
  plivo_call_uuid,
  last_status_detail
from recipients
where campaign_id = 2
order by id;
