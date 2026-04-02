-- Run in Supabase SQL Editor
-- Creates Web Push support tables for calendar reminders

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  expiration_time bigint null,
  user_agent text null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

drop trigger if exists push_subscriptions_set_updated_at on public.push_subscriptions;
create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row execute function public.set_updated_at();

create table if not exists public.event_reminder_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  event_id uuid not null references public.shared_calendar_events(id) on delete cascade,
  enabled boolean not null default false,
  remind_2d boolean not null default false,
  remind_1d boolean not null default false,
  remind_1h boolean not null default false,
  remind_at_start boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint event_reminder_preferences_user_event_unique unique (user_id, event_id),
  constraint event_reminder_preferences_enabled_has_timing_check check (
    enabled = false or remind_2d = true or remind_1d = true or remind_1h = true or remind_at_start = true
  )
);

create index if not exists event_reminder_preferences_user_id_idx
  on public.event_reminder_preferences (user_id);

create index if not exists event_reminder_preferences_event_id_idx
  on public.event_reminder_preferences (event_id);

create index if not exists event_reminder_preferences_enabled_idx
  on public.event_reminder_preferences (enabled);

drop trigger if exists event_reminder_preferences_set_updated_at on public.event_reminder_preferences;
create trigger event_reminder_preferences_set_updated_at
before update on public.event_reminder_preferences
for each row execute function public.set_updated_at();

create table if not exists public.event_reminder_delivery_log (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  event_id uuid not null references public.shared_calendar_events(id) on delete cascade,
  timing_id text not null check (timing_id in ('2d', '1d', '1h', '0m')),
  trigger_at timestamptz not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint event_reminder_delivery_log_unique unique (user_id, event_id, timing_id, trigger_at)
);

create index if not exists event_reminder_delivery_log_user_id_idx
  on public.event_reminder_delivery_log (user_id);

create index if not exists event_reminder_delivery_log_trigger_at_idx
  on public.event_reminder_delivery_log (trigger_at);

alter table public.push_subscriptions enable row level security;
alter table public.event_reminder_preferences enable row level security;
alter table public.event_reminder_delivery_log enable row level security;
