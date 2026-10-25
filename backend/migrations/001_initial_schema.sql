create table public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index users_email_lower_unique_idx on public.users (lower(email));

create table public.auth_sessions (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index auth_sessions_user_active_idx on public.auth_sessions (user_id, expires_at) where revoked_at is null;

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references public.users(id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  legal_name text,
  gstin text,
  address jsonb not null default '{}'::jsonb,
  invoice_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  email text,
  phone text,
  address jsonb not null default '{}'::jsonb,
  tax_id text,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id)
);

create table public.invoice_counters (
  business_id uuid not null references public.businesses(id) on delete cascade,
  fiscal_year integer not null,
  next_number bigint not null default 1 check (next_number > 0),
  primary key (business_id, fiscal_year)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  customer_id uuid not null,
  invoice_number text,
  status text not null default 'draft' check (status in ('draft', 'issued', 'partially_paid', 'paid', 'cancelled')),
  issue_date date,
  due_date date,
  currency text not null default 'INR' check (currency = 'INR'),
  subtotal_paise bigint not null default 0 check (subtotal_paise >= 0),
  discount_paise bigint not null default 0 check (discount_paise >= 0),
  tax_paise bigint not null default 0 check (tax_paise >= 0),
  total_paise bigint not null default 0 check (total_paise >= 0),
  paid_amount_paise bigint not null default 0 check (paid_amount_paise >= 0),
  outstanding_paise bigint not null default 0 check (outstanding_paise >= 0),
  notes text,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, invoice_number),
  foreign key (business_id, customer_id) references public.customers(business_id, id)
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  invoice_id uuid not null,
  description text not null check (length(trim(description)) between 1 and 500),
  quantity numeric(12, 3) not null check (quantity > 0 and quantity <= 100000),
  unit_price_paise bigint not null check (unit_price_paise between 0 and 9007199254740991),
  discount_bps integer not null default 0 check (discount_bps between 0 and 10000),
  tax_rate_bps integer not null default 0 check (tax_rate_bps between 0 and 10000),
  subtotal_paise bigint not null check (subtotal_paise >= 0),
  discount_paise bigint not null check (discount_paise >= 0),
  tax_paise bigint not null check (tax_paise >= 0),
  total_paise bigint not null check (total_paise >= 0),
  created_at timestamptz not null default now(),
  foreign key (business_id, invoice_id) references public.invoices(business_id, id) on delete cascade
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  customer_id uuid not null,
  amount_paise bigint not null check (amount_paise > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  method text not null check (method in ('cash', 'bank_transfer', 'cheque', 'other', 'razorpay')),
  source text not null check (source in ('manual', 'razorpay')),
  status text not null check (status in ('confirmed', 'pending', 'void', 'refunded')),
  reference text,
  received_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  foreign key (business_id, customer_id) references public.customers(business_id, id)
);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  payment_id uuid not null,
  invoice_id uuid not null,
  amount_paise bigint not null check (amount_paise > 0),
  created_at timestamptz not null default now(),
  foreign key (business_id, payment_id) references public.payments(business_id, id) on delete restrict,
  foreign key (business_id, invoice_id) references public.invoices(business_id, id) on delete restrict
);

create table public.cash_snapshots (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  amount_paise bigint not null check (amount_paise >= 0),
  recorded_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.cashflow_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  direction text not null check (direction in ('inflow', 'outflow')),
  amount_paise bigint not null check (amount_paise > 0),
  due_date date not null,
  category text not null,
  description text,
  is_actual boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cashflow_forecasts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  starting_balance_paise bigint not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table public.collection_plans (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  target_paise bigint not null check (target_paise > 0),
  deadline date not null,
  model_version text,
  recommendation jsonb not null,
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'executing', 'completed', 'cancelled')),
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id)
);

create table public.collection_plan_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  plan_id uuid not null,
  customer_id uuid not null,
  invoice_id uuid not null,
  recommended_amount_paise bigint not null check (recommended_amount_paise > 0),
  probability numeric(5, 4),
  is_demo_prediction boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (business_id, plan_id) references public.collection_plans(business_id, id) on delete cascade,
  foreign key (business_id, customer_id) references public.customers(business_id, id),
  foreign key (business_id, invoice_id) references public.invoices(business_id, id)
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  invoice_id uuid,
  collection_plan_id uuid,
  channel text not null,
  status text not null default 'pending' check (status in ('pending', 'queued', 'delivered', 'failed', 'cancelled')),
  scheduled_at timestamptz not null default now(),
  provider_reference text,
  delivery_result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (business_id, invoice_id) references public.invoices(business_id, id),
  foreign key (business_id, collection_plan_id) references public.collection_plans(business_id, id),
  check (invoice_id is not null or collection_plan_id is not null)
);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('razorpay', 'n8n')),
  event_id text not null,
  event_type text not null,
  status text not null default 'received' check (status in ('received', 'processed', 'failed')),
  safe_metadata jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  actor_user_id uuid references public.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create table public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  operation text not null,
  idempotency_key text not null,
  request_hash text not null,
  resource_id uuid not null,
  created_at timestamptz not null default now(),
  unique (business_id, operation, idempotency_key)
);

create index invoices_business_status_due_idx on public.invoices (business_id, status, due_date);
create index payments_business_received_idx on public.payments (business_id, received_at desc);
create index cashflow_business_due_idx on public.cashflow_entries (business_id, due_date);
create index audit_logs_business_created_idx on public.audit_logs (business_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger businesses_touch_updated_at before update on public.businesses
  for each row execute function public.touch_updated_at();
create trigger customers_touch_updated_at before update on public.customers
  for each row execute function public.touch_updated_at();
create trigger invoices_touch_updated_at before update on public.invoices
  for each row execute function public.touch_updated_at();
create trigger payments_touch_updated_at before update on public.payments
  for each row execute function public.touch_updated_at();
create trigger cashflow_entries_touch_updated_at before update on public.cashflow_entries
  for each row execute function public.touch_updated_at();
create trigger collection_plans_touch_updated_at before update on public.collection_plans
  for each row execute function public.touch_updated_at();
create trigger reminders_touch_updated_at before update on public.reminders
  for each row execute function public.touch_updated_at();

create or replace function public.audit_cashflow_change()
returns trigger
language plpgsql

set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_business_id uuid;
  v_entity_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_action text;
begin
  if tg_op = 'DELETE' then
    v_business_id := old.business_id;
    v_entity_id := old.id;
    v_before := to_jsonb(old);
    v_action := 'cashflow.deleted';
  elsif tg_op = 'UPDATE' then
    v_business_id := new.business_id;
    v_entity_id := new.id;
    v_before := to_jsonb(old);
    v_after := to_jsonb(new);
    v_action := 'cashflow.updated';
  else
    v_business_id := new.business_id;
    v_entity_id := new.id;
    v_after := to_jsonb(new);
    v_action := 'cashflow.created';
  end if;

  insert into public.audit_logs (
    business_id, actor_user_id, action, entity_type, entity_id, before_state, after_state
  ) values (
    v_business_id, nullif(current_setting('app.user_id', true), '')::uuid, v_action, tg_table_name, v_entity_id, v_before, v_after
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger cash_snapshots_audit_insert after insert on public.cash_snapshots
  for each row execute function public.audit_cashflow_change();
create trigger cashflow_entries_audit_change after insert or update or delete on public.cashflow_entries
  for each row execute function public.audit_cashflow_change();

create or replace function public.calculate_invoice_lines(p_items jsonb)
returns table (
  description text,
  quantity numeric,
  unit_price_paise bigint,
  discount_bps integer,
  tax_rate_bps integer,
  subtotal_paise bigint,
  discount_paise bigint,
  tax_paise bigint,
  total_paise bigint
)
language sql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
  with source as (
    select
      item->>'description' as description,
      (item->>'quantity_milli')::bigint as quantity_milli,
      (item->>'unit_price_paise')::bigint as unit_price_paise,
      (item->>'discount_bps')::integer as discount_bps,
      (item->>'tax_rate_bps')::integer as tax_rate_bps
    from jsonb_array_elements(p_items) item
  ),
  gross as (
    select *, round(quantity_milli::numeric * unit_price_paise::numeric / 1000)::bigint as subtotal_paise
    from source
  ),
  discounted as (
    select *, round(subtotal_paise::numeric * discount_bps / 10000)::bigint as discount_paise
    from gross
  ),
  taxed as (
    select *,
      round((subtotal_paise - discount_paise)::numeric * tax_rate_bps / 10000)::bigint as tax_paise
    from discounted
  )
  select
    description,
    quantity_milli::numeric / 1000,
    unit_price_paise,
    discount_bps,
    tax_rate_bps,
    subtotal_paise,
    discount_paise,
    tax_paise,
    subtotal_paise - discount_paise + tax_paise
  from taxed
  where quantity_milli > 0
    and unit_price_paise >= 0
    and discount_bps between 0 and 10000
    and tax_rate_bps between 0 and 10000
    and length(trim(description)) > 0
$$;

create or replace function public.create_draft_invoice(
  p_business_id uuid,
  p_customer_id uuid,
  p_issue_date date,
  p_due_date date,
  p_notes text,
  p_items jsonb,
  p_idempotency_key text,
  p_request_hash text
) returns uuid
language plpgsql

set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_invoice_id uuid;
  v_existing public.idempotency_keys%rowtype;
  v_subtotal bigint;
  v_discount bigint;
  v_tax bigint;
  v_total bigint;
begin
  if not exists (select 1 from public.businesses where id = p_business_id and owner_user_id = nullif(current_setting('app.user_id', true), '')::uuid) then
    raise exception 'business not owned';
  end if;
  if p_idempotency_key !~ '^[!-~]{8,128}$' or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid idempotency parameters';
  end if;
  if not exists (select 1 from public.customers where id = p_customer_id and business_id = p_business_id and archived_at is null) then
    raise exception 'customer unavailable';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'invalid invoice items';
  end if;
  select sum(subtotal_paise), sum(discount_paise), sum(tax_paise), sum(total_paise)
    into v_subtotal, v_discount, v_tax, v_total from public.calculate_invoice_lines(p_items);
  if (select count(*) from public.calculate_invoice_lines(p_items)) <> jsonb_array_length(p_items) then
    raise exception 'invalid invoice line';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || ':invoice.create:' || p_idempotency_key, 0));
  select * into v_existing from public.idempotency_keys
    where business_id = p_business_id and operation = 'invoice.create' and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_hash <> p_request_hash then raise exception 'idempotency key conflict'; end if;
    return v_existing.resource_id;
  end if;

  insert into public.invoices (
    business_id, customer_id, status, issue_date, due_date, notes,
    subtotal_paise, discount_paise, tax_paise, total_paise, outstanding_paise
  ) values (
    p_business_id, p_customer_id, 'draft', p_issue_date, p_due_date, p_notes,
    v_subtotal, v_discount, v_tax, v_total, v_total
  ) returning id into v_invoice_id;

  insert into public.invoice_items (
    business_id, invoice_id, description, quantity, unit_price_paise,
    discount_bps, tax_rate_bps, subtotal_paise, discount_paise, tax_paise, total_paise
  )
  select
    p_business_id, v_invoice_id, line.description, line.quantity, line.unit_price_paise,
    line.discount_bps, line.tax_rate_bps, line.subtotal_paise, line.discount_paise,
    line.tax_paise, line.total_paise
  from public.calculate_invoice_lines(p_items) line;

  insert into public.idempotency_keys (business_id, operation, idempotency_key, request_hash, resource_id)
  values (p_business_id, 'invoice.create', p_idempotency_key, p_request_hash, v_invoice_id);
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, after_state)
  values (p_business_id, nullif(current_setting('app.user_id', true), '')::uuid, 'invoice.draft_created', 'invoice', v_invoice_id,
    jsonb_build_object('total_paise', v_total));
  return v_invoice_id;
end;
$$;

create or replace function public.update_draft_invoice(
  p_business_id uuid,
  p_invoice_id uuid,
  p_customer_id uuid,
  p_issue_date date,
  p_due_date date,
  p_notes text,
  p_items jsonb
) returns uuid
language plpgsql

set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_before jsonb;
  v_subtotal bigint;
  v_discount bigint;
  v_tax bigint;
  v_total bigint;
begin
  if not exists (select 1 from public.businesses where id = p_business_id and owner_user_id = nullif(current_setting('app.user_id', true), '')::uuid) then
    raise exception 'business not owned';
  end if;
  if not exists (select 1 from public.customers where id = p_customer_id and business_id = p_business_id and archived_at is null) then
    raise exception 'customer unavailable';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'invalid invoice items';
  end if;
  select sum(subtotal_paise), sum(discount_paise), sum(tax_paise), sum(total_paise)
    into v_subtotal, v_discount, v_tax, v_total from public.calculate_invoice_lines(p_items);
  if (select count(*) from public.calculate_invoice_lines(p_items)) <> jsonb_array_length(p_items) then
    raise exception 'invalid invoice line';
  end if;
  select to_jsonb(i) into v_before from public.invoices i
    where i.id = p_invoice_id and i.business_id = p_business_id and i.status = 'draft'
    for update;
  if not found then raise exception 'invoice is not editable'; end if;

  update public.invoices set
    customer_id = p_customer_id, issue_date = p_issue_date, due_date = p_due_date, notes = p_notes,
    subtotal_paise = v_subtotal,
    discount_paise = v_discount,
    tax_paise = v_tax,
    total_paise = v_total,
    outstanding_paise = v_total,
    updated_at = now()
    where id = p_invoice_id and business_id = p_business_id;
  delete from public.invoice_items where invoice_id = p_invoice_id and business_id = p_business_id;
  insert into public.invoice_items (
    business_id, invoice_id, description, quantity, unit_price_paise,
    discount_bps, tax_rate_bps, subtotal_paise, discount_paise, tax_paise, total_paise
  )
  select
    p_business_id, p_invoice_id, line.description, line.quantity, line.unit_price_paise,
    line.discount_bps, line.tax_rate_bps, line.subtotal_paise, line.discount_paise,
    line.tax_paise, line.total_paise
  from public.calculate_invoice_lines(p_items) line;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, before_state, after_state)
  values (p_business_id, nullif(current_setting('app.user_id', true), '')::uuid, 'invoice.draft_updated', 'invoice', p_invoice_id, v_before,
    jsonb_build_object('total_paise', v_total));
  return p_invoice_id;
end;
$$;

create or replace function public.issue_invoice(p_business_id uuid, p_invoice_id uuid)
returns uuid
language plpgsql

set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_invoice public.invoices%rowtype;
  v_year integer;
  v_number bigint;
  v_formatted_number text;
begin
  if not exists (select 1 from public.businesses where id = p_business_id and owner_user_id = nullif(current_setting('app.user_id', true), '')::uuid) then
    raise exception 'business not owned';
  end if;
  select * into v_invoice from public.invoices
    where id = p_invoice_id and business_id = p_business_id for update;
  if not found then return null; end if;
  if v_invoice.status = 'issued' or v_invoice.status in ('partially_paid', 'paid') then return v_invoice.id; end if;
  if v_invoice.status <> 'draft' then raise exception 'invoice cannot be issued'; end if;
  v_year := extract(year from coalesce(v_invoice.issue_date, current_date))::integer;
  insert into public.invoice_counters (business_id, fiscal_year, next_number)
  values (p_business_id, v_year, 2)
  on conflict (business_id, fiscal_year)
  do update set next_number = public.invoice_counters.next_number + 1
  returning next_number - 1 into v_number;
  v_formatted_number := v_year::text || '-' || lpad(v_number::text, greatest(6, length(v_number::text)), '0');
  update public.invoices set status = 'issued',
    invoice_number = v_formatted_number,
    issue_date = coalesce(issue_date, current_date),
    updated_at = now()
    where id = p_invoice_id and business_id = p_business_id;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, before_state, after_state)
  values (p_business_id, nullif(current_setting('app.user_id', true), '')::uuid, 'invoice.issued', 'invoice', p_invoice_id,
    jsonb_build_object('status', 'draft'),
    jsonb_build_object('status', 'issued', 'invoice_number', v_formatted_number));
  return p_invoice_id;
end;
$$;

create or replace function public.cancel_invoice(p_business_id uuid, p_invoice_id uuid, p_reason text)
returns uuid
language plpgsql

set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_invoice public.invoices%rowtype;
begin
  if not exists (select 1 from public.businesses where id = p_business_id and owner_user_id = nullif(current_setting('app.user_id', true), '')::uuid) then
    raise exception 'business not owned';
  end if;
  select * into v_invoice from public.invoices
    where id = p_invoice_id and business_id = p_business_id for update;
  if not found then return null; end if;
  if v_invoice.status not in ('issued', 'draft') or v_invoice.paid_amount_paise > 0 then
    raise exception 'invoice cannot be cancelled';
  end if;
  update public.invoices set status = 'cancelled', cancellation_reason = p_reason, updated_at = now()
    where id = p_invoice_id and business_id = p_business_id;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, before_state, after_state)
  values (p_business_id, nullif(current_setting('app.user_id', true), '')::uuid, 'invoice.cancelled', 'invoice', p_invoice_id,
    jsonb_build_object('status', v_invoice.status),
    jsonb_build_object('status', 'cancelled', 'reason', p_reason));
  return p_invoice_id;
end;
$$;

create or replace function public.record_manual_payment(
  p_business_id uuid,
  p_customer_id uuid,
  p_amount_paise bigint,
  p_method text,
  p_received_at timestamptz,
  p_reference text,
  p_allocations jsonb,
  p_idempotency_key text,
  p_request_hash text
) returns uuid
language plpgsql

set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_payment_id uuid;
  v_invoice public.invoices%rowtype;
  v_allocation record;
  v_total_allocated bigint := 0;
  v_existing public.idempotency_keys%rowtype;
begin
  if not exists (select 1 from public.businesses where id = p_business_id and owner_user_id = nullif(current_setting('app.user_id', true), '')::uuid) then
    raise exception 'business not owned';
  end if;
  if p_idempotency_key !~ '^[!-~]{8,128}$' or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid idempotency parameters';
  end if;
  if not exists (select 1 from public.customers where id = p_customer_id and business_id = p_business_id and archived_at is null) then
    raise exception 'customer unavailable';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || ':payment.create:' || p_idempotency_key, 0));
  select * into v_existing from public.idempotency_keys
    where business_id = p_business_id and operation = 'payment.create' and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_hash <> p_request_hash then raise exception 'idempotency key conflict'; end if;
    return v_existing.resource_id;
  end if;

  select coalesce(sum((item->>'amount_paise')::bigint), 0) into v_total_allocated
    from jsonb_array_elements(p_allocations) item;
  if v_total_allocated > p_amount_paise then raise exception 'allocations exceed payment'; end if;

  insert into public.payments (
    business_id, customer_id, amount_paise, method, source, status, reference, received_at
  ) values (
    p_business_id, p_customer_id, p_amount_paise, p_method, 'manual', 'confirmed', p_reference, p_received_at
  ) returning id into v_payment_id;

  for v_allocation in select
      (item->>'invoice_id')::uuid as invoice_id,
      (item->>'amount_paise')::bigint as amount_paise
    from jsonb_array_elements(p_allocations) item
  loop
    select * into v_invoice from public.invoices
      where id = v_allocation.invoice_id and business_id = p_business_id and customer_id = p_customer_id
      for update;
    if not found or v_invoice.status not in ('issued', 'partially_paid') then
      raise exception 'invoice cannot receive allocation';
    end if;
    if v_allocation.amount_paise <= 0 or v_allocation.amount_paise > v_invoice.outstanding_paise then
      raise exception 'allocation exceeds invoice balance';
    end if;
    insert into public.payment_allocations (business_id, payment_id, invoice_id, amount_paise)
      values (p_business_id, v_payment_id, v_invoice.id, v_allocation.amount_paise);
    update public.invoices set
      paid_amount_paise = paid_amount_paise + v_allocation.amount_paise,
      outstanding_paise = outstanding_paise - v_allocation.amount_paise,
      status = case when outstanding_paise - v_allocation.amount_paise = 0 then 'paid' else 'partially_paid' end,
      updated_at = now()
      where id = v_invoice.id and business_id = p_business_id;
  end loop;

  insert into public.idempotency_keys (business_id, operation, idempotency_key, request_hash, resource_id)
    values (p_business_id, 'payment.create', p_idempotency_key, p_request_hash, v_payment_id);
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, after_state)
    values (p_business_id, nullif(current_setting('app.user_id', true), '')::uuid, 'payment.recorded', 'payment', v_payment_id,
        jsonb_build_object('amount_paise', p_amount_paise, 'source', 'manual', 'allocations', p_allocations));
  return v_payment_id;
end;
$$;

create or replace function public.allocate_payment(
  p_business_id uuid,
  p_payment_id uuid,
  p_allocations jsonb,
  p_idempotency_key text,
  p_request_hash text
) returns uuid
language plpgsql

set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_payment public.payments%rowtype;
  v_invoice public.invoices%rowtype;
  v_allocation record;
  v_existing_allocated bigint;
  v_additional bigint := 0;
  v_existing public.idempotency_keys%rowtype;
begin
  if not exists (select 1 from public.businesses where id = p_business_id and owner_user_id = nullif(current_setting('app.user_id', true), '')::uuid) then
    raise exception 'business not owned';
  end if;
  if p_idempotency_key !~ '^[!-~]{8,128}$' or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid idempotency parameters';
  end if;
  select * into v_payment from public.payments
    where id = p_payment_id and business_id = p_business_id for update;
  if not found or v_payment.status <> 'confirmed' then raise exception 'payment unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || ':payment.allocate:' || p_idempotency_key, 0));
  select * into v_existing from public.idempotency_keys
    where business_id = p_business_id and operation = 'payment.allocate' and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_hash <> p_request_hash then raise exception 'idempotency key conflict'; end if;
    return v_existing.resource_id;
  end if;
  select coalesce(sum((item->>'amount_paise')::bigint), 0) into v_additional
    from jsonb_array_elements(p_allocations) item;
  select coalesce(sum(amount_paise), 0) into v_existing_allocated
    from public.payment_allocations where payment_id = p_payment_id and business_id = p_business_id;
  if v_existing_allocated + v_additional > v_payment.amount_paise then raise exception 'allocations exceed payment'; end if;

  for v_allocation in select
      (item->>'invoice_id')::uuid as invoice_id,
      (item->>'amount_paise')::bigint as amount_paise
    from jsonb_array_elements(p_allocations) item
  loop
    select * into v_invoice from public.invoices
      where id = v_allocation.invoice_id and business_id = p_business_id
        and customer_id = v_payment.customer_id for update;
    if not found or v_invoice.status not in ('issued', 'partially_paid') then
      raise exception 'invoice cannot receive allocation';
    end if;
    if v_allocation.amount_paise <= 0 or v_allocation.amount_paise > v_invoice.outstanding_paise then
      raise exception 'allocation exceeds invoice balance';
    end if;
    insert into public.payment_allocations (business_id, payment_id, invoice_id, amount_paise)
      values (p_business_id, p_payment_id, v_invoice.id, v_allocation.amount_paise);
    update public.invoices set
      paid_amount_paise = paid_amount_paise + v_allocation.amount_paise,
      outstanding_paise = outstanding_paise - v_allocation.amount_paise,
      status = case when outstanding_paise - v_allocation.amount_paise = 0 then 'paid' else 'partially_paid' end,
      updated_at = now()
      where id = v_invoice.id and business_id = p_business_id;
  end loop;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, after_state)
    values (p_business_id, nullif(current_setting('app.user_id', true), '')::uuid, 'payment.allocated', 'payment', p_payment_id,
      jsonb_build_object('additional_allocated_paise', v_additional, 'allocations', p_allocations));
  insert into public.idempotency_keys (business_id, operation, idempotency_key, request_hash, resource_id)
    values (p_business_id, 'payment.allocate', p_idempotency_key, p_request_hash, p_payment_id);
  return p_payment_id;
end;
$$;

create or replace function public.create_cashflow_forecast(
  p_business_id uuid,
  p_start_date date,
  p_horizon_days integer
) returns jsonb
language plpgsql

set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_snapshot public.cash_snapshots%rowtype;
  v_end_date date;
  v_daily jsonb;
  v_shortage_date date;
  v_cash_gap bigint;
  v_result jsonb;
begin
  if not exists (select 1 from public.businesses where id = p_business_id and owner_user_id = nullif(current_setting('app.user_id', true), '')::uuid) then
    raise exception 'business not owned';
  end if;
  if p_horizon_days not between 1 and 365 then raise exception 'invalid forecast horizon'; end if;
  select * into v_snapshot from public.cash_snapshots
    where business_id = p_business_id order by recorded_at desc limit 1;
  if not found then raise exception 'cash snapshot not found'; end if;
  if p_start_date < (v_snapshot.recorded_at at time zone 'UTC')::date then
    raise exception 'forecast predates cash snapshot';
  end if;
  v_end_date := p_start_date + p_horizon_days - 1;

  with days as (
    select (p_start_date + series.day_offset)::date as forecast_date
      from generate_series(0, p_horizon_days - 1) as series(day_offset)
  ),
  movements as (
    select due_date,
      sum(case when direction = 'inflow' and is_actual then amount_paise else 0 end)::bigint as actual_inflow,
      sum(case when direction = 'outflow' and is_actual then amount_paise else 0 end)::bigint as actual_outflow,
      sum(case when direction = 'inflow' and not is_actual then amount_paise else 0 end)::bigint as estimated_inflow,
      sum(case when direction = 'outflow' and not is_actual then amount_paise else 0 end)::bigint as estimated_outflow
    from public.cashflow_entries
    where business_id = p_business_id and due_date between p_start_date and v_end_date
    group by due_date
  ),
  daily as (
    select days.forecast_date,
      coalesce(movements.actual_inflow, 0)::bigint as actual_inflow,
      coalesce(movements.actual_outflow, 0)::bigint as actual_outflow,
      coalesce(movements.estimated_inflow, 0)::bigint as estimated_inflow,
      coalesce(movements.estimated_outflow, 0)::bigint as estimated_outflow,
      (v_snapshot.amount_paise + sum(
        coalesce(movements.actual_inflow, 0) + coalesce(movements.estimated_inflow, 0)
        - coalesce(movements.actual_outflow, 0) - coalesce(movements.estimated_outflow, 0)
      ) over (order by days.forecast_date))::bigint as projected_balance
    from days left join movements on movements.due_date = days.forecast_date
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'date', forecast_date,
      'actualInflowPaise', actual_inflow,
      'actualOutflowPaise', actual_outflow,
      'estimatedInflowPaise', estimated_inflow,
      'estimatedOutflowPaise', estimated_outflow,
      'projectedBalancePaise', projected_balance
    ) order by forecast_date), '[]'::jsonb),
    (select forecast_date from daily where projected_balance < 0 order by forecast_date limit 1),
    coalesce(max(greatest(-projected_balance, 0)), 0)
  into v_daily, v_shortage_date, v_cash_gap
  from daily;

  v_result := jsonb_build_object(
    'startingBalancePaise', v_snapshot.amount_paise,
    'horizonDays', p_horizon_days,
    'dailyBalances', v_daily,
    'shortageDate', v_shortage_date,
    'cashGapPaise', v_cash_gap,
    'isEstimate', true
  );
  insert into public.cashflow_forecasts (
    business_id, start_date, end_date, starting_balance_paise, result
  ) values (
    p_business_id, p_start_date, v_end_date, v_snapshot.amount_paise, v_result
  );
  return v_result;
end;
$$;

create or replace function public.store_razorpay_webhook_event(
  p_event_id text,
  p_event_type text,
  p_payload jsonb
) returns jsonb
language plpgsql

set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_rows integer;
begin
  insert into public.webhook_events (provider, event_id, event_type, safe_metadata)
  values (
    'razorpay',
    p_event_id,
    p_event_type,
    jsonb_strip_nulls(jsonb_build_object(
      'payment_id', p_payload #>> '{payload,payment,entity,id}',
      'payment_link_id', p_payload #>> '{payload,payment_link,entity,id}',
      'order_id', p_payload #>> '{payload,payment,entity,order_id}'
    ))
  )
  on conflict (provider, event_id) do nothing;
  get diagnostics v_rows = row_count;
  return jsonb_build_object('duplicate', v_rows = 0);
end;
$$;

create or replace function public.record_n8n_delivery_status(
  p_event_id text,
  p_reminder_id uuid,
  p_status text,
  p_provider_reference text,
  p_safe_result jsonb
) returns jsonb
language plpgsql

set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_rows integer;
begin
  if p_status not in ('delivered', 'failed') then raise exception 'invalid status'; end if;
  insert into public.webhook_events (provider, event_id, event_type, safe_metadata)
  values ('n8n', p_event_id, 'delivery_status', jsonb_build_object('reminder_id', p_reminder_id))
  on conflict (provider, event_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return jsonb_build_object('duplicate', true); end if;

  update public.reminders set
    status = p_status,
    provider_reference = p_provider_reference,
    delivery_result = coalesce(p_safe_result, '{}'::jsonb),
    updated_at = now()
  where id = p_reminder_id and status in ('pending', 'queued', 'failed');
  if not found then
    update public.webhook_events set status = 'failed'
      where provider = 'n8n' and event_id = p_event_id;
    raise exception 'reminder unavailable for delivery update';
  end if;
  update public.webhook_events set status = 'processed', processed_at = now()
    where provider = 'n8n' and event_id = p_event_id;
  return jsonb_build_object('duplicate', false);
end;
$$;
