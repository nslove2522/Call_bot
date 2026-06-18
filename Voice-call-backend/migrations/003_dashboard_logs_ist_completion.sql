-- Hotfix V5: Premium dashboard, campaign lifecycle, logs export, and Indian timezone display support.
-- Note: PostgreSQL/Supabase valid IANA timezone for India is Asia/Kolkata. Chennai uses the same IST timezone.

alter table campaigns
  add column if not exists status text not null default 'draft';

alter table campaigns
  add column if not exists started_at timestamptz;

alter table campaigns
  add column if not exists stopped_at timestamptz;

alter table campaigns
  add column if not exists completed_at timestamptz;

update campaigns
set status = 'draft'
where status is null or trim(status) = '';

update campaigns c
set status = 'completed', completed_at = coalesce(completed_at, now())
where exists (
  select 1 from recipients r where r.campaign_id = c.id
)
and not exists (
  select 1
  from recipients r
  where r.campaign_id = c.id
    and coalesce(r.status, 'pending') not in ('completed', 'failed', 'failed_permanent', 'cancelled')
)
and coalesce(c.status, '') not in ('stopped', 'completed');

create index if not exists idx_campaigns_status_created_at
on campaigns(status, created_at desc);

create index if not exists idx_recipients_campaign_status
on recipients(campaign_id, status);

create index if not exists idx_call_events_recipient_timestamp
on call_events(recipient_id, timestamp);
