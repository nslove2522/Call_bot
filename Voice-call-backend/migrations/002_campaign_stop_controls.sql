-- Hotfix V4: Campaign stop controls
-- Run this in Supabase SQL Editor before using Stop Campaign.

alter table public.campaigns
  add column if not exists status text not null default 'draft';

alter table public.campaigns
  add column if not exists started_at timestamptz;

alter table public.campaigns
  add column if not exists stopped_at timestamptz;

alter table public.campaigns
  add column if not exists completed_at timestamptz;

update public.campaigns
set status = coalesce(nullif(status, ''), 'draft')
where status is null or status = '';

create index if not exists idx_campaigns_status
on public.campaigns(status);

create index if not exists idx_recipients_campaign_status
on public.recipients(campaign_id, status);
