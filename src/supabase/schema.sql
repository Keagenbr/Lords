-- Run this once in the Supabase dashboard: SQL Editor > New query > paste > Run.

-- One row per waitress per day, taken from the daily CASH UP sheet.
create table if not exists public.cash_up_rows (
  date        date          not null,
  staff_name  text          not null,
  manager     text          not null default '',
  source_file text          not null default '',
  sales       numeric(14,4) not null default 0,
  tabbs       numeric(14,4) not null default 0,
  c_c_tips    numeric(14,4) not null default 0,
  net_cash    numeric(14,4) not null default 0,
  tips        numeric(14,4) not null default 0,
  deductions  numeric(14,4) not null default 0,
  paid        numeric(14,4) not null default 0,  -- the sheet's "Paid" column, sign kept as is
  created_at  timestamptz   not null default now(),
  primary key (date, staff_name)
);

-- Only the server (using the secret key) may touch this table.
-- RLS is on and there are deliberately no policies, so the publishable/anon key sees nothing.
alter table public.cash_up_rows enable row level security;
revoke all on table public.cash_up_rows from anon, authenticated;
grant select, insert, update, delete on table public.cash_up_rows to service_role;

-- Replaces whole days in ONE transaction: delete the dates being uploaded, then insert the new rows.
-- If anything fails, nothing changes. (supabase-js can't group separate calls into a transaction.)
create or replace function public.replace_cash_up_days(p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n integer;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'p_rows must be a non-empty JSON array';
  end if;

  delete from public.cash_up_rows
  where date in (select distinct (r ->> 'date')::date from jsonb_array_elements(p_rows) as r);

  insert into public.cash_up_rows
    (date, staff_name, manager, source_file, sales, tabbs, c_c_tips, net_cash, tips, deductions, paid)
  select
    date, staff_name, coalesce(manager, ''), coalesce(source_file, ''),
    coalesce(sales, 0), coalesce(tabbs, 0), coalesce(c_c_tips, 0), coalesce(net_cash, 0),
    coalesce(tips, 0), coalesce(deductions, 0), coalesce(paid, 0)
  from jsonb_populate_recordset(null::public.cash_up_rows, p_rows);

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.replace_cash_up_days(jsonb) from public, anon, authenticated;
grant  execute on function public.replace_cash_up_days(jsonb) to service_role;

-- Make the new function visible to the API straight away.
notify pgrst, 'reload schema';
