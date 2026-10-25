import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../config/database.js";
import { env } from "../config/env.js";
import { calculateInvoiceTotals } from "../utils/money.js";
import { hashPassword, verifyPassword } from "../utils/password.js";

export const DEMO_EMAIL = "vikrant.badade50@spit.ac.in";
export const DEMO_PASSWORD = "123";
export const DEMO_BUSINESS_ID = "10000000-0000-4000-8000-000000000001";

const seedMarker = "baaki-development-demo-v1";
const confirmationValue = "true";
const seedAnchorDate = new Date();
seedAnchorDate.setUTCHours(0, 0, 0, 0);
const customerIds = [
  "20000000-0000-4000-8000-000000000001",
  "20000000-0000-4000-8000-000000000002",
  "20000000-0000-4000-8000-000000000003",
  "20000000-0000-4000-8000-000000000004",
  "20000000-0000-4000-8000-000000000005",
  "20000000-0000-4000-8000-000000000006",
  "20000000-0000-4000-8000-000000000007",
  "20000000-0000-4000-8000-000000000008",
];
const planIds = [
  "30000000-0000-4000-8000-000000000001",
  "30000000-0000-4000-8000-000000000002",
  "30000000-0000-4000-8000-000000000003",
];

class SeedError extends Error {}

const customers = [
  { name: "Monsoon Paper Co. (Fictional)", contact: "Asha Mehta", email: "asha@monsoon-paper.example", phone: "+91-00000-00001", city: "Mumbai", notes: "Usually pays on time" },
  { name: "Harbor Deskworks (Fictional)", contact: "Rohan Kulkarni", email: "rohan@harbor-deskworks.example", phone: "+91-00000-00002", city: "Pune", notes: "Usually pays on time" },
  { name: "Cobalt Office Mart (Fictional)", contact: "Nisha Shah", email: "nisha@cobalt-mart.example", phone: "+91-00000-00003", city: "Nashik", notes: "Has overdue invoices" },
  { name: "Pinecone Business Supply (Fictional)", contact: "Arjun Rao", email: "arjun@pinecone-supply.example", phone: "+91-00000-00004", city: "Thane", notes: "Has overdue invoices" },
  { name: "Lantern Ledger Services (Fictional)", contact: "Ira Desai", email: "ira@lantern-ledger.example", phone: "+91-00000-00005", city: "Mumbai", notes: "Has partially paid invoices" },
  { name: "Paper Kite Studio (Fictional)", contact: "Dev Patil", email: "dev@paper-kite.example", phone: "+91-00000-00006", city: "Kolhapur", notes: "Has partially paid invoices" },
  { name: "Blue Banyan Trading (Fictional)", contact: "Mira Joshi", email: "mira@blue-banyan.example", phone: "+91-00000-00007", city: "Nagpur", notes: "Several invoices with mixed status" },
  { name: "Quiet Compass Works (Fictional)", contact: "Kunal Iyer", email: "kunal@quiet-compass.example", phone: "+91-00000-00008", city: "Mumbai", notes: "New customer; no invoices yet" },
];

function dateOffset(days) {
  const date = new Date(seedAnchorDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function timestampOffset(days, hour = 10) {
  return `${dateOffset(days)}T${String(hour).padStart(2, "0")}:00:00.000Z`;
}

function stableHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function ensure(condition, message) {
  if (!condition) throw new SeedError(message);
}

function freshCounts() {
  return Object.fromEntries([
    "users",
    "businesses",
    "customers",
    "invoices",
    "payments",
    "cashSnapshots",
    "cashflowEntries",
    "collectionPlans",
    "collectionPlanItems",
    "reminders",
    "auditLogs",
    "webhookEvents",
  ].map((key) => [key, { inserted: 0, reused: 0 }]));
}

function markCount(counts, key, inserted) {
  counts[key][inserted ? "inserted" : "reused"] += 1;
}

export function validateSeedOptions({ configuration = env, password, confirmation } = {}) {
  if (configuration.NODE_ENV !== "development") {
    throw new SeedError("Demo seeding is permitted only when NODE_ENV=development.");
  }
  if (confirmation !== confirmationValue) {
    throw new SeedError("Set BAAKI_DEMO_SEED_CONFIRM=true to confirm local demo seeding.");
  }
  if (password !== DEMO_PASSWORD) {
    throw new SeedError("Set BAAKI_DEMO_PASSWORD to the requested local demo password before seeding.");
  }
}

async function ensureDemoUser(db, password, counts) {
  const existing = await db.query(
    "select id,email,password_hash,created_at from public.users where lower(email) = lower($1) for update",
    [DEMO_EMAIL],
  );
  if (existing.rows[0]) {
    const user = existing.rows[0];
    ensure(
      await verifyPassword(password, user.password_hash),
      "The demo email already belongs to an account with a different password; refusing to change it.",
    );
    markCount(counts, "users", false);
    return user;
  }

  const passwordHash = await hashPassword(password);
  const inserted = await db.query(
    `insert into public.users (email,password_hash)
     values ($1,$2) returning id,email,password_hash,created_at`,
    [DEMO_EMAIL, passwordHash],
  );
  markCount(counts, "users", true);
  return inserted.rows[0];
}

async function ensureDemoBusiness(db, ownerId, counts) {
  const existing = await db.query(
    "select * from public.businesses where owner_user_id = $1 for update",
    [ownerId],
  );
  if (existing.rows[0]) {
    const business = existing.rows[0];
    ensure(
      business.name === "Vikrant Office Supplies" &&
      business.legal_name === "Vikrant Office Supplies - Development Demo" &&
      business.address?.seedMarker === seedMarker,
      "The demo owner already has a different business; refusing to modify it.",
    );
    markCount(counts, "businesses", false);
    return business;
  }

  const address = {
    line1: "14 Example Arcade",
    line2: "Demo District",
    city: "Mumbai",
    state: "Maharashtra",
    postalCode: "400000",
    country: "IN",
    seedMarker,
  };
  const invoiceSettings = {
    currency: "INR",
    paymentTermsDays: 15,
    industry: "Office supplies and business services",
  };
  const inserted = await db.query(
    `insert into public.businesses
       (id,owner_user_id,name,legal_name,address,invoice_settings)
     values ($1,$2,$3,$4,$5::jsonb,$6::jsonb)
     returning *`,
    [
      DEMO_BUSINESS_ID,
      ownerId,
      "Vikrant Office Supplies",
      "Vikrant Office Supplies - Development Demo",
      JSON.stringify(address),
      JSON.stringify(invoiceSettings),
    ],
  );
  markCount(counts, "businesses", true);
  return inserted.rows[0];
}

async function ensureCustomers(db, businessId, counts) {
  for (let index = 0; index < customers.length; index += 1) {
    const customer = customers[index];
    const customerId = customerIds[index];
    const notes = `[${seedMarker}] Fictional contact: ${customer.contact}. ${customer.notes}. Do not contact.`;
    const address = {
      line1: "Example Industrial Estate",
      city: customer.city,
      state: "Maharashtra",
      postalCode: "400000",
      country: "IN",
    };
    const inserted = await db.query(
      `insert into public.customers
         (id,business_id,name,email,phone,address,notes)
       values ($1,$2,$3,$4,$5,$6::jsonb,$7)
       on conflict (id) do nothing
       returning id`,
      [customerId, businessId, customer.name, customer.email, customer.phone, JSON.stringify(address), notes],
    );
    const existing = await db.query(
      "select business_id,name,email,phone,notes from public.customers where id = $1",
      [customerId],
    );
    ensure(
      existing.rows[0]?.business_id === businessId &&
      existing.rows[0]?.name === customer.name &&
      existing.rows[0]?.email === customer.email &&
      existing.rows[0]?.phone === customer.phone &&
      existing.rows[0]?.notes === notes,
      `A deterministic demo customer ID conflicts with different data (${index + 1}).`,
    );
    markCount(counts, "customers", inserted.rowCount === 1);
  }
}

const invoiceDefinitions = [
  { customer: 0, issue: -55, due: -40, label: "Paid on time", lines: [{ description: "A4 copier paper cartons", quantityMilli: 2000, unitPricePaise: 650000, discountBps: 300, taxRateBps: 1800 }] },
  { customer: 1, issue: -48, due: -33, label: "Paid on time", lines: [{ description: "Desk organiser sets", quantityMilli: 3000, unitPricePaise: 210000, discountBps: 0, taxRateBps: 1800 }] },
  { customer: 6, issue: -42, due: -27, label: "Paid in full", lines: [{ description: "Thermal label rolls", quantityMilli: 5000, unitPricePaise: 84000, discountBps: 500, taxRateBps: 1200 }] },
  { customer: 2, issue: -38, due: -23, label: "Overdue balance", lines: [{ description: "Fictional office stationery bundle", quantityMilli: 4000, unitPricePaise: 275000, discountBps: 250, taxRateBps: 1800 }] },
  { customer: 2, issue: -29, due: -14, label: "Overdue balance", lines: [{ description: "Presentation folders", quantityMilli: 6000, unitPricePaise: 48000, discountBps: 0, taxRateBps: 1200 }] },
  { customer: 3, issue: -24, due: -9, label: "Overdue balance", lines: [{ description: "Desktop filing trays", quantityMilli: 2500, unitPricePaise: 190000, discountBps: 400, taxRateBps: 1800 }] },
  { customer: 3, issue: -5, due: 10, label: "Due soon", lines: [{ description: "Office whiteboard markers", quantityMilli: 12000, unitPricePaise: 12500, discountBps: 0, taxRateBps: 1200 }] },
  { customer: 4, issue: -20, due: -5, label: "Partially paid", lines: [{ description: "Ergonomic desk mats", quantityMilli: 5000, unitPricePaise: 165000, discountBps: 500, taxRateBps: 1800 }] },
  { customer: 5, issue: -12, due: 3, label: "Partially paid", lines: [{ description: "Shipping label printer rolls", quantityMilli: 7000, unitPricePaise: 73000, discountBps: 0, taxRateBps: 1800 }] },
  { customer: 6, issue: -10, due: 5, label: "Several invoices", lines: [{ description: "Fictional copier maintenance kit", quantityMilli: 2000, unitPricePaise: 475000, discountBps: 250, taxRateBps: 1800 }] },
  { customer: 6, issue: -8, due: -1, label: "Several invoices", lines: [{ description: "Document storage boxes", quantityMilli: 8000, unitPricePaise: 56000, discountBps: 0, taxRateBps: 1200 }] },
  { customer: 6, issue: -3, due: 12, label: "Several invoices", lines: [{ description: "Fictional binding supplies", quantityMilli: 3000, unitPricePaise: 145000, discountBps: 0, taxRateBps: 1800 }] },
  { customer: 6, draft: true, label: "Draft estimate", lines: [{ description: "Draft desk accessories", quantityMilli: 2000, unitPricePaise: 250000, discountBps: 0, taxRateBps: 1800 }] },
  { customer: 4, draft: true, label: "Draft estimate", lines: [{ description: "Draft paper stock", quantityMilli: 5000, unitPricePaise: 65000, discountBps: 200, taxRateBps: 1200 }] },
  { customer: 0, issue: -2, due: 13, label: "Due soon", lines: [{ description: "Fictional toner cartridges", quantityMilli: 2000, unitPricePaise: 390000, discountBps: 0, taxRateBps: 1800 }] },
];

function serializedLines(lines) {
  const totals = calculateInvoiceTotals(lines);
  return totals.items.map((item) => ({
    description: item.description,
    quantity_milli: item.quantityMilli,
    unit_price_paise: item.unitPricePaise,
    discount_bps: item.discountBps,
    tax_rate_bps: item.taxRateBps,
  }));
}

async function ensureInvoices(db, businessId, counts) {
  const invoicesByNumber = [];
  for (let index = 0; index < invoiceDefinitions.length; index += 1) {
    const definition = invoiceDefinitions[index];
    const key = `demo-seed-v1-invoice-${String(index + 1).padStart(2, "0")}`;
    const issueDate = definition.draft ? dateOffset(0) : dateOffset(definition.issue);
    const dueDate = definition.draft ? dateOffset(15) : dateOffset(definition.due);
    const notes = `[${seedMarker}] Fictional sample: ${definition.label}.`;
    const items = serializedLines(definition.lines);
    const requestHash = stableHash({
      businessId,
      customerId: customerIds[definition.customer],
      issueDate,
      dueDate,
      notes,
      items,
    });
    const previous = await db.query(
      `select resource_id from public.idempotency_keys
       where business_id = $1 and operation = 'invoice.create' and idempotency_key = $2`,
      [businessId, key],
    );
    const created = await db.query(
      `select public.create_draft_invoice($1,$2,$3::date,$4::date,$5,$6::jsonb,$7,$8) as id`,
      [
        businessId,
        customerIds[definition.customer],
        issueDate,
        dueDate,
        notes,
        JSON.stringify(items),
        key,
        requestHash,
      ],
    );
    const invoiceId = created.rows[0].id;
    if (!definition.draft) {
      await db.query("select public.issue_invoice($1,$2)", [businessId, invoiceId]);
    }
    const invoice = await db.query(
      "select id,customer_id,status,total_paise,paid_amount_paise,outstanding_paise,invoice_number from public.invoices where id = $1 and business_id = $2",
      [invoiceId, businessId],
    );
    ensure(invoice.rows[0], `Seed invoice ${index + 1} was not created.`);
    invoicesByNumber.push({ ...invoice.rows[0], definition, customerId: customerIds[definition.customer] });
    markCount(counts, "invoices", previous.rowCount === 0);
  }
  return invoicesByNumber;
}

function paymentAllocations(invoices) {
  const allocated = (invoiceIndex, fraction) => ({
    invoice_id: invoices[invoiceIndex].id,
    amount_paise: Math.floor(invoices[invoiceIndex].total_paise * fraction),
  });
  const full = (invoiceIndex) => ({
    invoice_id: invoices[invoiceIndex].id,
    amount_paise: invoices[invoiceIndex].total_paise,
  });
  return [
    { customer: 0, method: "bank_transfer", allocations: [full(0)] },
    { customer: 1, method: "cheque", allocations: [full(1)] },
    { customer: 6, method: "cash", allocations: [full(2)] },
    { customer: 4, method: "bank_transfer", allocations: [allocated(7, 0.35)] },
    { customer: 5, method: "cash", allocations: [allocated(8, 0.4)] },
    { customer: 6, method: "bank_transfer", allocations: [allocated(9, 0.25)] },
    { customer: 6, method: "cheque", allocations: [allocated(9, 0.15), allocated(10, 0.3)] },
    { customer: 0, method: "other", amountPaise: 500000, allocations: [] },
    { customer: 2, method: "cash", amountPaise: 350000, allocations: [] },
    { customer: 3, method: "bank_transfer", amountPaise: 425000, allocations: [] },
  ];
}

async function ensurePayments(db, businessId, invoices, counts) {
  const payments = paymentAllocations(invoices);
  for (let index = 0; index < payments.length; index += 1) {
    const payment = payments[index];
    const key = `demo-seed-v1-payment-${String(index + 1).padStart(2, "0")}`;
    const allocations = payment.allocations;
    const amountPaise = payment.amountPaise ??
      allocations.reduce((sum, item) => sum + item.amount_paise, 0);
    const receivedAt = timestampOffset(-Math.max(1, 12 - index), 11);
    const reference = `DEMO-RECEIPT-${String(index + 1).padStart(2, "0")}`;
    const requestHash = stableHash({
      businessId,
      customerId: customerIds[payment.customer],
      amountPaise,
      method: payment.method,
      receivedAt,
      reference,
      allocations,
    });
    const previous = await db.query(
      `select resource_id from public.idempotency_keys
       where business_id = $1 and operation = 'payment.create' and idempotency_key = $2`,
      [businessId, key],
    );
    await db.query(
      `select public.record_manual_payment($1,$2,$3,$4,$5::timestamptz,$6,$7::jsonb,$8,$9) as id`,
      [
        businessId,
        customerIds[payment.customer],
        amountPaise,
        payment.method,
        receivedAt,
        reference,
        JSON.stringify(allocations),
        key,
        requestHash,
      ],
    );
    markCount(counts, "payments", previous.rowCount === 0);
  }
}

async function refreshSeedInvoices(db, businessId, invoices) {
  for (const invoice of invoices) {
    const result = await db.query(
      `select id,customer_id,status,total_paise,paid_amount_paise,outstanding_paise,invoice_number
       from public.invoices where id = $1 and business_id = $2`,
      [invoice.id, businessId],
    );
    ensure(result.rows[0], "A seeded invoice disappeared during payment reconciliation.");
    Object.assign(invoice, result.rows[0]);
  }
}

async function ensureCashSnapshot(db, businessId, counts) {
  const snapshotId = "60000000-0000-4000-8000-000000000001";
  const inserted = await db.query(
    `insert into public.cash_snapshots (id,business_id,amount_paise,recorded_at)
     values ($1,$2,$3,now()) on conflict (id) do nothing returning id`,
    [snapshotId, businessId, 15000000],
  );
  const existing = await db.query(
    "select business_id,amount_paise from public.cash_snapshots where id = $1",
    [snapshotId],
  );
  ensure(
    existing.rows[0]?.business_id === businessId &&
    existing.rows[0]?.amount_paise === 15000000,
    "The deterministic demo cash snapshot ID conflicts with different data.",
  );
  markCount(counts, "cashSnapshots", inserted.rowCount === 1);
}

async function ensureCashflowEntries(db, businessId, invoices, counts) {
  const entries = [
    { direction: "inflow", amount: invoices[3].outstanding_paise, due: -4, category: "invoice_receivable", description: "Estimated overdue invoice collection", invoice: 3 },
    { direction: "inflow", amount: invoices[4].outstanding_paise, due: 4, category: "invoice_receivable", description: "Estimated customer collection", invoice: 4 },
    { direction: "inflow", amount: invoices[5].outstanding_paise, due: 9, category: "invoice_receivable", description: "Estimated customer collection", invoice: 5 },
    { direction: "inflow", amount: invoices[6].outstanding_paise, due: 12, category: "invoice_receivable", description: "Estimated due-soon invoice collection", invoice: 6 },
    { direction: "inflow", amount: invoices[7].outstanding_paise, due: 18, category: "invoice_receivable", description: "Estimated partial-invoice balance", invoice: 7 },
    { direction: "inflow", amount: invoices[8].outstanding_paise, due: 25, category: "invoice_receivable", description: "Estimated partial-invoice balance", invoice: 8 },
    { direction: "outflow", amount: 250000, due: -3, category: "supplier", description: "DEMO ESTIMATE: prior-period supplies" },
    { direction: "outflow", amount: 3800000, due: 2, category: "rent", description: "DEMO ESTIMATE: office rent" },
    { direction: "outflow", amount: 8000000, due: 5, category: "salary", description: "DEMO ESTIMATE: monthly salaries" },
    { direction: "outflow", amount: 6500000, due: 8, category: "supplier", description: "DEMO ESTIMATE: supplier purchases" },
    { direction: "outflow", amount: 900000, due: 14, category: "utilities", description: "DEMO ESTIMATE: electricity and internet" },
    { direction: "outflow", amount: 600000, due: 20, category: "operating_expense", description: "DEMO ESTIMATE: operating costs" },
  ];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const id = `70000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    const description = entry.invoice === undefined
      ? entry.description
      : `${entry.description} (invoice ${invoices[entry.invoice].invoice_number})`;
    const dueDate = dateOffset(entry.due);
    const inserted = await db.query(
      `insert into public.cashflow_entries
         (id,business_id,direction,amount_paise,due_date,category,description,is_actual)
       values ($1,$2,$3,$4,$5,$6,$7,false)
       on conflict (id) do nothing returning id`,
      [id, businessId, entry.direction, entry.amount, dueDate, entry.category, description],
    );
    const existing = await db.query(
      "select business_id,direction,amount_paise,due_date,category,description,is_actual from public.cashflow_entries where id = $1",
      [id],
    );
    ensure(
      existing.rows[0]?.business_id === businessId &&
      existing.rows[0]?.direction === entry.direction &&
      existing.rows[0]?.amount_paise === entry.amount &&
      existing.rows[0]?.due_date === dueDate &&
      existing.rows[0]?.description === description &&
      existing.rows[0]?.is_actual === false,
      `A deterministic cash-flow entry ID conflicts with different data (${index + 1}).`,
    );
    markCount(counts, "cashflowEntries", inserted.rowCount === 1);
  }
}

const planDefinitions = [
  { status: "proposed", scenario: "Draft plan awaiting review", target: 3500000, deadline: 10, invoiceIndexes: [3, 4], planItems: [3, 4] },
  { status: "proposed", scenario: "Plan awaiting owner approval", target: 5000000, deadline: 15, invoiceIndexes: [5, 6], planItems: [5, 6] },
  { status: "approved", scenario: "Approved plan eligible for owner-triggered execution", target: 3000000, deadline: 12, invoiceIndexes: [7, 8], planItems: [7, 8] },
];

async function ensureCollectionPlans(db, businessId, invoices, counts) {
  const planItems = [];
  for (let index = 0; index < planDefinitions.length; index += 1) {
    const definition = planDefinitions[index];
    const planId = planIds[index];
    const deadline = dateOffset(definition.deadline);
    const recommendation = {
      seedMarker,
      scenario: definition.scenario,
      selectedOption: index + 1,
      strategy: "Fictional development demo scenario",
      targetPaise: definition.target,
      deadlineDays: definition.deadline,
      isDemoPrediction: true,
    };
    const inserted = await db.query(
      `insert into public.collection_plans
         (id,business_id,target_paise,deadline,model_version,recommendation,status,approved_at)
       values ($1,$2,$3,$4,'baaki-demo-seed-v1',$5::jsonb,$6,$7)
       on conflict (id) do nothing returning id`,
      [
        planId,
        businessId,
        definition.target,
        deadline,
        JSON.stringify(recommendation),
        definition.status,
        definition.status === "approved" ? new Date().toISOString() : null,
      ],
    );
    const existing = await db.query(
      "select business_id,target_paise,recommendation->>'seedMarker' as marker from public.collection_plans where id = $1",
      [planId],
    );
    ensure(
      existing.rows[0]?.business_id === businessId &&
      existing.rows[0]?.target_paise === definition.target &&
      existing.rows[0]?.marker === seedMarker,
      `A deterministic collection plan ID conflicts with different data (${index + 1}).`,
    );
    markCount(counts, "collectionPlans", inserted.rowCount === 1);

    for (let itemIndex = 0; itemIndex < definition.planItems.length; itemIndex += 1) {
      const invoiceIndex = definition.planItems[itemIndex];
      const invoice = invoices[invoiceIndex];
      const itemId = `40000000-0000-4000-8000-${String(index * 10 + itemIndex + 1).padStart(12, "0")}`;
      const recommendedAmount = Math.max(1, Math.min(invoice.outstanding_paise, definition.target));
      const itemInsert = await db.query(
        `insert into public.collection_plan_items
           (id,business_id,plan_id,customer_id,invoice_id,recommended_amount_paise,probability,is_demo_prediction)
         values ($1,$2,$3,$4,$5,$6,$7,true)
         on conflict (id) do nothing returning id`,
        [itemId, businessId, planId, invoice.customer_id, invoice.id, recommendedAmount, 0.72 + index * 0.04],
      );
      const itemExisting = await db.query(
        "select business_id,plan_id,customer_id,invoice_id from public.collection_plan_items where id = $1",
        [itemId],
      );
      ensure(
        itemExisting.rows[0]?.business_id === businessId &&
        itemExisting.rows[0]?.plan_id === planId &&
        itemExisting.rows[0]?.customer_id === invoice.customer_id &&
        itemExisting.rows[0]?.invoice_id === invoice.id,
        "A deterministic collection-plan item ID conflicts with different data.",
      );
      markCount(counts, "collectionPlanItems", itemInsert.rowCount === 1);
      planItems.push({ id: itemId, planId, invoice });
    }

    const auditId = `50000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    const action = `demo.seed.synthetic.collection_plan_${definition.status}`;
    const audit = await db.query(
      `insert into public.audit_logs
         (id,business_id,actor_user_id,action,entity_type,entity_id,after_state)
       values ($1,$2,$3,$4,'collection_plan',$5,$6::jsonb)
       on conflict (id) do nothing returning id`,
      [
        auditId,
        businessId,
        (await db.query("select owner_user_id from public.businesses where id = $1", [businessId])).rows[0].owner_user_id,
        action,
        planId,
        JSON.stringify({ synthetic: true, source: seedMarker, scenario: definition.scenario }),
      ],
    );
    markCount(counts, "auditLogs", audit.rowCount === 1);
  }
  return planItems;
}

async function ensureReminders(db, businessId, planItems, counts) {
  const reminderFixtures = [
    { id: "80000000-0000-4000-8000-000000000001", item: 0, status: "pending", days: 2 },
    { id: "80000000-0000-4000-8000-000000000002", item: 1, status: "cancelled", days: -3 },
    { id: "80000000-0000-4000-8000-000000000003", item: 2, status: "pending", days: 4 },
    { id: "80000000-0000-4000-8000-000000000004", item: 3, status: "pending", days: 6 },
    { id: "80000000-0000-4000-8000-000000000005", item: 4, status: "cancelled", days: -1 },
  ];
  for (const fixture of reminderFixtures) {
    const target = planItems[fixture.item];
    const scheduledAt = timestampOffset(fixture.days, 9);
    const deliveryResult = {
      synthetic: true,
      source: seedMarker,
      note: "No delivery was attempted by this seed.",
    };
    const inserted = await db.query(
      `insert into public.reminders
         (id,business_id,invoice_id,collection_plan_id,channel,status,scheduled_at,delivery_result)
       values ($1,$2,$3,$4,'whatsapp',$5,$6,$7::jsonb)
       on conflict (id) do nothing returning id`,
      [
        fixture.id,
        businessId,
        target.invoice.id,
        target.planId,
        fixture.status,
        scheduledAt,
        JSON.stringify(deliveryResult),
      ],
    );
    const existing = await db.query(
      "select business_id,invoice_id,collection_plan_id,delivery_result->>'source' as source from public.reminders where id = $1",
      [fixture.id],
    );
    ensure(
      existing.rows[0]?.business_id === businessId &&
      existing.rows[0]?.invoice_id === target.invoice.id &&
      existing.rows[0]?.collection_plan_id === target.planId &&
      existing.rows[0]?.source === seedMarker,
      "A deterministic demo reminder ID conflicts with different data.",
    );
    markCount(counts, "reminders", inserted.rowCount === 1);
  }
}

export async function seedDemoDataset({
  databasePool = pool,
  configuration = env,
  password = process.env.BAAKI_DEMO_PASSWORD,
  confirmation = process.env.BAAKI_DEMO_SEED_CONFIRM,
} = {}) {
  validateSeedOptions({ configuration, password, confirmation });
  const client = await databasePool.connect();
  const counts = freshCounts();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [seedMarker]);
    const applied = await client.query(
      `select version from public.schema_migrations
       where version in ('001_initial_schema.sql','002_invoice_documents.sql')`,
    );
    ensure(
      applied.rowCount === 2,
      "Apply the active database migrations before running the development seed.",
    );

    const user = await ensureDemoUser(client, password, counts);
    await client.query("select set_config('app.user_id',$1,true)", [user.id]);
    const business = await ensureDemoBusiness(client, user.id, counts);
    await ensureCustomers(client, business.id, counts);
    const invoices = await ensureInvoices(client, business.id, counts);
    await ensurePayments(client, business.id, invoices, counts);
    await refreshSeedInvoices(client, business.id, invoices);
    await ensureCashSnapshot(client, business.id, counts);
    await ensureCashflowEntries(client, business.id, invoices, counts);
    const planItems = await ensureCollectionPlans(client, business.id, invoices, counts);
    await ensureReminders(client, business.id, planItems, counts);
    await client.query("commit");
    return counts;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const summary = await seedDemoDataset();
    console.info("Development demo seed completed.", summary);
  } catch (error) {
    console.error("Development demo seed failed.", {
      reason: error instanceof SeedError ? error.message : "A database operation failed.",
      code: error.code,
    });
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
