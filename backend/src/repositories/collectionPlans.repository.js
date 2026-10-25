import { withDatabaseContext } from "../utils/databaseResult.js";
import { AppError } from "../errors/AppError.js";

export function getInvoicesForPlanning(db, businessId, customerIds = null) {
  const values = [businessId];
  let customerFilter = "";
  if (customerIds?.length) {
    values.push(customerIds);
    customerFilter = `and i.customer_id = any($${values.length}::uuid[])`;
  }
  return withDatabaseContext(
    db.query(
      `select i.id,i.invoice_number,i.customer_id,i.status,i.due_date,i.issue_date,i.total_paise,
       i.paid_amount_paise,i.outstanding_paise,i.notes,
       jsonb_build_object('id',c.id,'name',c.name,'archived_at',c.archived_at) as customers
       from public.invoices i join public.customers c
         on c.business_id = i.business_id and c.id = i.customer_id
       where i.business_id = $1 and i.status = any(array['issued','partially_paid'])
         and i.outstanding_paise > 0 ${customerFilter}`,
      values,
    ),
    "select", "invoices",
  );
}

export function insertCollectionPlan(db, businessId, { targetPaise, deadlineDate, recommendation, modelVersion = "baaki-planner-v1.0" }) {
  return withDatabaseContext(
    db.query(
      `insert into public.collection_plans
       (business_id,target_paise,deadline,model_version,recommendation,status)
       values ($1,$2,$3,$4,$5::jsonb,'proposed') returning *`,
      [businessId, targetPaise, deadlineDate, modelVersion, JSON.stringify(recommendation)],
    ),
    "insert", "collection_plans", { single: true },
  );
}

function itemRecords(businessId, planId, items) {
  return items.map((item) => ({
    business_id: businessId,
    plan_id: planId,
    customer_id: item.customerId,
    invoice_id: item.invoiceId,
    recommended_amount_paise: item.recommendedAmountPaise,
    probability: item.probability ?? 0.75,
    is_demo_prediction: item.isDemoPrediction ?? true,
  }));
}

export function insertCollectionPlanItems(db, businessId, planId, items) {
  return withDatabaseContext(
    db.query(
      `insert into public.collection_plan_items
       (business_id,plan_id,customer_id,invoice_id,recommended_amount_paise,probability,is_demo_prediction)
       select x.business_id,x.plan_id,x.customer_id,x.invoice_id,x.recommended_amount_paise,x.probability,x.is_demo_prediction
       from jsonb_to_recordset($1::jsonb) as x(
         business_id uuid,plan_id uuid,customer_id uuid,invoice_id uuid,
         recommended_amount_paise bigint,probability numeric,is_demo_prediction boolean
       ) returning *`,
      [JSON.stringify(itemRecords(businessId, planId, items))],
    ),
    "insert", "collection_plan_items",
  );
}

export async function createCollectionPlanWithItems(db, businessId, planInput, items) {
  return db.transaction(async (tx) => {
    const plan = await insertCollectionPlan(tx, businessId, planInput);
    if (plan.error) throw plan.error;
    if (items.length) {
      const inserted = await insertCollectionPlanItems(tx, businessId, plan.data.id, items);
      if (inserted.error) throw inserted.error;
    }
    return getCollectionPlan(tx, businessId, plan.data.id);
  });
}

export function listCollectionPlans(db, businessId, { page = 1, limit = 25, status }) {
  const values = [businessId];
  let predicate = "business_id = $1";
  if (status) {
    values.push(status);
    predicate += ` and status = $${values.length}`;
  }
  values.push(limit, (page - 1) * limit);
  return withDatabaseContext(
    db.query(
      `select *,count(*) over()::integer as total_count from public.collection_plans
       where ${predicate} order by created_at desc limit $${values.length - 1} offset $${values.length}`,
      values,
    ),
    "select", "collection_plans",
  ).then(({ data, error }) => ({
    data: data?.map(({ total_count: _total, ...row }) => row) ?? data,
    error,
    count: data?.[0]?.total_count ?? 0,
  }));
}

export function getCollectionPlan(db, businessId, planId) {
  return withDatabaseContext(
    db.query(
      `select p.*,
       coalesce((
         select jsonb_agg(
           jsonb_build_object(
             'id',i.id,'customer_id',i.customer_id,'invoice_id',i.invoice_id,
             'recommended_amount_paise',i.recommended_amount_paise,'probability',i.probability,
             'is_demo_prediction',i.is_demo_prediction,'created_at',i.created_at,
             'customers',case when c.id is null then null else jsonb_build_object('id',c.id,'name',c.name,'email',c.email,'phone',c.phone) end,
             'invoices',case when v.id is null then null else jsonb_build_object(
               'id',v.id,'invoice_number',v.invoice_number,'status',v.status,
               'total_paise',v.total_paise,'outstanding_paise',v.outstanding_paise,'due_date',v.due_date
             ) end
           ) order by i.created_at
         )
         from public.collection_plan_items i
         left join public.customers c on c.business_id = i.business_id and c.id = i.customer_id
         left join public.invoices v on v.business_id = i.business_id and v.id = i.invoice_id
         where i.business_id = p.business_id and i.plan_id = p.id
       ), '[]'::jsonb) as collection_plan_items
       from public.collection_plans p where p.business_id = $1 and p.id = $2`,
      [businessId, planId],
    ),
    "select", "collection_plans", { single: true },
  );
}

export function updateCollectionPlan(db, businessId, planId, fields) {
  const allowed = ["status", "approved_at", "rejected_at", "recommendation"];
  const keys = Object.keys(fields).filter((key) => allowed.includes(key));
  const values = keys.map((key) => key === "recommendation" ? JSON.stringify(fields[key]) : fields[key]);
  const assignments = keys.map((key, index) => `${key} = $${index + 1}${key === "recommendation" ? "::jsonb" : ""}`);
  values.push(businessId, planId);
  return withDatabaseContext(
    db.query(
      `update public.collection_plans set ${assignments.join(", ")}
       where business_id = $${values.length - 1} and id = $${values.length} returning *`,
      values,
    ),
    "update", "collection_plans", { single: true },
  );
}

export async function insertPlanReminders(db, businessId, planId, items) {
  const reminders = items.map((item) => ({
    business_id: businessId,
    collection_plan_id: planId,
    invoice_id: item.invoiceId || item.invoice_id,
    channel: "whatsapp",
    status: "pending",
    scheduled_at: new Date().toISOString(),
    delivery_result: {},
  }));
  return withDatabaseContext(
    db.query(
      `insert into public.reminders
       (business_id,collection_plan_id,invoice_id,channel,status,scheduled_at,delivery_result)
       select x.business_id,x.collection_plan_id,x.invoice_id,x.channel,x.status,x.scheduled_at,x.delivery_result
       from jsonb_to_recordset($1::jsonb) as x(
         business_id uuid,collection_plan_id uuid,invoice_id uuid,channel text,status text,
         scheduled_at timestamptz,delivery_result jsonb
       ) returning *`,
      [JSON.stringify(reminders)],
    ),
    "insert", "reminders",
  );
}

export async function executePlanWithReminders(db, businessId, planId, items) {
  return db.transaction(async (tx) => {
    const current = await tx.query(
      "select status from public.collection_plans where business_id = $1 and id = $2 for update",
      [businessId, planId],
    );
    if (!current.rows[0] || current.rows[0].status !== "approved") {
      throw new AppError(409, "PLAN_NOT_APPROVED", "Collection plan must be approved before execution");
    }
    const reminders = await insertPlanReminders(tx, businessId, planId, items);
    if (reminders.error) throw reminders.error;
    const plan = await updateCollectionPlan(tx, businessId, planId, { status: "executing" });
    if (plan.error) throw plan.error;
    return { plan: plan.data, reminders: reminders.data };
  });
}
