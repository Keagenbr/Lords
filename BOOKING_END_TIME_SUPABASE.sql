-- Run once in the Supabase SQL editor.
-- Adds an optional finish time to group booking requests.
-- booking_time (the start time) is already nullable, so bookings made
-- without any time are stored with booking_time = NULL.

alter table public.booking_requests
  add column if not exists booking_end_time time null;

-- The finish time, when present, must come after the start time.
alter table public.booking_requests
  drop constraint if exists booking_requests_end_after_start;
alter table public.booking_requests
  add constraint booking_requests_end_after_start
  check (
    booking_end_time is null
    or (booking_time is not null and booking_end_time > booking_time)
  );
