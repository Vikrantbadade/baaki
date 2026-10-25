alter table public.invoices
  add column if not exists financial_year integer,
  add column if not exists issued_snapshot jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'invoices_due_date_after_issue_date'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_due_date_after_issue_date
      check (due_date is null or issue_date is null or due_date >= issue_date) not valid;
  end if;
end;
$$;

create table if not exists public.invoice_documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  invoice_id uuid not null,
  document_type text not null check (document_type in ('invoice_pdf', 'demand_letter', 'attachment', 'payment_evidence')),
  original_filename text not null check (length(original_filename) between 1 and 255),
  storage_key text not null unique,
  mime_type text not null,
  byte_size bigint not null check (byte_size between 1 and 10485760),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (business_id, invoice_id) references public.invoices(business_id, id) on delete restrict,
  check (
    (document_type in ('invoice_pdf', 'demand_letter') and mime_type = 'application/pdf')
    or (document_type in ('attachment', 'payment_evidence') and mime_type in ('application/pdf', 'image/jpeg', 'image/png'))
  )
);

create index if not exists invoice_documents_invoice_created_idx
  on public.invoice_documents (business_id, invoice_id, created_at desc);

create table if not exists public.invoice_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  invoice_id uuid not null,
  actor_user_id uuid references public.users(id) on delete set null,
  event_type text not null,
  reference_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (business_id, invoice_id) references public.invoices(business_id, id) on delete restrict
);

create index if not exists invoice_events_invoice_created_idx
  on public.invoice_events (business_id, invoice_id, created_at desc, id);

create table public.document_download_tokens (
  token_hash text primary key,
  document_id uuid not null references public.invoice_documents(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index document_download_tokens_expiry_idx on public.document_download_tokens (expires_at);

create or replace function public.record_invoice_event()
returns trigger
language plpgsql

set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_event_type text;
  v_metadata jsonb;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'invoice.draft_created';
    v_metadata := jsonb_build_object('status', new.status);
  elsif old.status is distinct from new.status then
    v_event_type := 'invoice.' || new.status;
    v_metadata := jsonb_build_object(
      'previous_status', old.status,
      'status', new.status,
      'invoice_number', new.invoice_number
    );
  elsif old.issued_snapshot is distinct from new.issued_snapshot then
    v_event_type := 'invoice.issued_snapshot_created';
    v_metadata := jsonb_build_object('financial_year', new.financial_year);
  elsif old.paid_amount_paise is distinct from new.paid_amount_paise
     or old.outstanding_paise is distinct from new.outstanding_paise then
    v_event_type := 'invoice.payment_balance_updated';
    v_metadata := jsonb_build_object(
      'status', new.status,
      'paid_amount_paise', new.paid_amount_paise,
      'outstanding_paise', new.outstanding_paise
    );
  elsif old.status = 'draft' then
    v_event_type := 'invoice.draft_updated';
    v_metadata := jsonb_build_object('status', new.status);
  else
    v_event_type := 'invoice.updated';
    v_metadata := jsonb_build_object('status', new.status);
  end if;

  insert into public.invoice_events (business_id, invoice_id, actor_user_id, event_type, metadata)
  values (new.business_id, new.id, nullif(current_setting('app.user_id', true), '')::uuid, v_event_type, coalesce(v_metadata, '{}'::jsonb));
  return new;
end;
$$;

drop trigger if exists invoices_record_event on public.invoices;
create trigger invoices_record_event
  after insert or update on public.invoices
  for each row execute function public.record_invoice_event();

create or replace function public.record_invoice_document_event()
returns trigger
language plpgsql

set search_path = pg_catalog, public, pg_temp
as $$
begin
  insert into public.invoice_events (
    business_id, invoice_id, actor_user_id, event_type, reference_id, metadata
  ) values (
    new.business_id, new.invoice_id, new.uploaded_by, 'invoice.document_generated', new.id,
    jsonb_build_object('document_type', new.document_type, 'mime_type', new.mime_type, 'byte_size', new.byte_size)
  );
  return new;
end;
$$;

drop trigger if exists invoice_documents_record_event on public.invoice_documents;
create trigger invoice_documents_record_event
  after insert on public.invoice_documents
  for each row execute function public.record_invoice_document_event();

create or replace function public.issue_invoice(p_business_id uuid, p_invoice_id uuid)
returns uuid
language plpgsql

set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_invoice public.invoices%rowtype;
  v_business public.businesses%rowtype;
  v_customer public.customers%rowtype;
  v_year integer;
  v_number bigint;
  v_formatted_number text;
  v_issued_date date;
  v_snapshot jsonb;
begin
  if not exists (
    select 1 from public.businesses
    where id = p_business_id and owner_user_id = nullif(current_setting('app.user_id', true), '')::uuid
  ) then
    raise exception 'business not owned';
  end if;

  select * into v_invoice from public.invoices
  where id = p_invoice_id and business_id = p_business_id
  for update;
  if not found then return null; end if;
  if v_invoice.status in ('issued', 'partially_paid', 'paid') then return v_invoice.id; end if;
  if v_invoice.status <> 'draft' then raise exception 'invoice cannot be issued'; end if;

  select * into v_business from public.businesses where id = p_business_id;
  select * into v_customer from public.customers
  where id = v_invoice.customer_id and business_id = p_business_id;
  if not found then raise exception 'invoice customer unavailable'; end if;

  v_issued_date := coalesce(v_invoice.issue_date, current_date);
  v_year := extract(year from v_issued_date)::integer
    - case when extract(month from v_issued_date) < 4 then 1 else 0 end;

  insert into public.invoice_counters (business_id, fiscal_year, next_number)
  values (p_business_id, v_year, 2)
  on conflict (business_id, fiscal_year)
  do update set next_number = public.invoice_counters.next_number + 1
  returning next_number - 1 into v_number;

  v_formatted_number := v_year::text || '-' || right((v_year + 1)::text, 2)
    || '-' || lpad(v_number::text, greatest(6, length(v_number::text)), '0');

  select jsonb_build_object(
    'invoiceId', v_invoice.id,
    'invoiceNumber', v_formatted_number,
    'documentType', 'commercial',
    'status', 'issued',
    'issueDate', v_issued_date,
    'dueDate', v_invoice.due_date,
    'financialYear', v_year,
    'currency', v_invoice.currency,
    'notes', v_invoice.notes,
    'totals', jsonb_build_object(
      'subtotalPaise', v_invoice.subtotal_paise,
      'discountPaise', v_invoice.discount_paise,
      'taxPaise', v_invoice.tax_paise,
      'totalPaise', v_invoice.total_paise
    ),
    'seller', jsonb_build_object(
      'name', v_business.name,
      'legalName', v_business.legal_name,
      'gstin', v_business.gstin,
      'address', v_business.address,
      'invoiceSettings', jsonb_strip_nulls(jsonb_build_object(
        'upiVpa', v_business.invoice_settings->>'upiVpa',
        'upiDisplayName', v_business.invoice_settings->>'upiDisplayName'
      ))
    ),
    'buyer', jsonb_build_object(
      'name', v_customer.name,
      'email', v_customer.email,
      'phone', v_customer.phone,
      'taxId', v_customer.tax_id,
      'address', v_customer.address
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'description', ii.description,
        'quantity', ii.quantity,
        'unitPricePaise', ii.unit_price_paise,
        'discountBps', ii.discount_bps,
        'taxRateBps', ii.tax_rate_bps,
        'subtotalPaise', ii.subtotal_paise,
        'discountPaise', ii.discount_paise,
        'taxPaise', ii.tax_paise,
        'totalPaise', ii.total_paise
      ) order by ii.created_at, ii.id)
      from public.invoice_items ii
      where ii.invoice_id = v_invoice.id and ii.business_id = p_business_id
    ), '[]'::jsonb)
  ) into v_snapshot;

  update public.invoices set status = 'issued',
    invoice_number = v_formatted_number,
    issue_date = v_issued_date,
    financial_year = v_year,
    issued_snapshot = v_snapshot,
    updated_at = now()
  where id = p_invoice_id and business_id = p_business_id;

  insert into public.audit_logs (
    business_id, actor_user_id, action, entity_type, entity_id, before_state, after_state
  ) values (
    p_business_id, nullif(current_setting('app.user_id', true), '')::uuid, 'invoice.issued', 'invoice', p_invoice_id,
    jsonb_build_object('status', 'draft'),
    jsonb_build_object('status', 'issued', 'invoice_number', v_formatted_number, 'financial_year', v_year)
  );
  return p_invoice_id;
end;
$$;
