-- Call Bot Supabase schema
-- Paste this into Supabase SQL Editor and run once.

create table if not exists public.campaigns (
  id bigserial primary key,
  name text not null,
  type text not null check (type in ('voice', 'sms')),
  message_text text,
  voice_url text,
  retry_delay_minutes integer not null default 5,
  max_attempts integer not null default 4,
  created_at timestamptz not null default now()
);

create table if not exists public.recipients (
  id bigserial primary key,
  campaign_id bigint not null references public.campaigns(id) on delete cascade,
  phone_number text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_attempt_at text,
  next_attempt_at text,
  last_status_detail text,
  plivo_call_uuid text
);

create table if not exists public.call_events (
  id bigserial primary key,
  recipient_id bigint references public.recipients(id) on delete set null,
  plivo_call_uuid text,
  event_type text,
  timestamp timestamptz not null default now(),
  details jsonb
);

create index if not exists idx_recipients_campaign_id
on public.recipients(campaign_id);

create index if not exists idx_recipients_status_next_attempt
on public.recipients(status, next_attempt_at);

create index if not exists idx_recipients_plivo_call_uuid
on public.recipients(plivo_call_uuid);

create index if not exists idx_call_events_recipient_id
on public.call_events(recipient_id);

-- Storage bucket used for voice/audio files.
-- Public is enabled so Plivo can fetch audio files using a plain URL.
insert into storage.buckets (id, name, public)
values ('voice-files', 'voice-files', true)
on conflict (id) do update set public = excluded.public;
