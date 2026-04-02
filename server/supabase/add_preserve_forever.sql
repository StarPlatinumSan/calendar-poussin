alter table public.shared_calendar_events
add column if not exists preserve_forever boolean;

update public.shared_calendar_events
set preserve_forever = false
where preserve_forever is null;

alter table public.shared_calendar_events
alter column preserve_forever set default false;

alter table public.shared_calendar_events
alter column preserve_forever set not null;

create index if not exists shared_calendar_events_preserve_forever_idx
on public.shared_calendar_events (preserve_forever);
