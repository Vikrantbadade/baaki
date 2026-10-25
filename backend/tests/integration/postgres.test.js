import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { pool, createUserDatabase } from "../../src/config/database.js";
import { runMigrations } from "../../src/database/migrate.js";
import { findBusinessForOwner } from "../../src/repositories/business.repository.js";
import { createCustomer, getCustomer } from "../../src/repositories/customers.repository.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const safeTestDatabase = (() => {
  if (!testDatabaseUrl) return false;
  try {
    const parsed = new URL(testDatabaseUrl);
    return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) &&
      /(?:^|_)test$/i.test(decodeURIComponent(parsed.pathname.slice(1)));
  } catch {
    return false;
  }
})();

describe.skipIf(!safeTestDatabase)("local PostgreSQL integration", () => {
  const fixtureUsers = [];
  const fixtureBusinesses = [];
  const fixtureCustomers = [];
  const fixtureInvoices = [];
  const fixturePlans = [];

  beforeAll(async () => {
    await runMigrations();
    for (let index = 0; index < 2; index += 1) {
      const id = randomUUID();
      fixtureUsers.push(id);
      const { rows } = await pool.query(
        "insert into public.users (id,email,password_hash) values ($1,$2,$3) returning id",
        [id, `${id}@integration.test`, "not-a-login-hash"],
      );
      expect(rows[0].id).toBe(id);
      const business = await pool.query(
        "insert into public.businesses (owner_user_id,name) values ($1,$2) returning id",
        [id, `Integration business ${index}`],
      );
      fixtureBusinesses.push(business.rows[0].id);
      const customer = await pool.query(
        "insert into public.customers (business_id,name) values ($1,$2) returning id",
        [business.rows[0].id, `Integration customer ${index}`],
      );
      fixtureCustomers.push(customer.rows[0].id);
      const invoice = await pool.query(
        "insert into public.invoices (business_id,customer_id,status) values ($1,$2,'draft') returning id",
        [business.rows[0].id, customer.rows[0].id],
      );
      fixtureInvoices.push(invoice.rows[0].id);
    }
    const plan = await pool.query(
      `insert into public.collection_plans
       (business_id,target_paise,deadline,model_version,recommendation,status)
       values ($1,100,'2026-12-01','integration-test','{}','proposed') returning id`,
      [fixtureBusinesses[0]],
    );
    fixturePlans.push(plan.rows[0].id);
  });

  afterAll(async () => {
    if (fixtureBusinesses.length) {
      await pool.query("delete from public.invoice_events where business_id = any($1::uuid[])", [fixtureBusinesses]);
      await pool.query("delete from public.collection_plan_items where business_id = any($1::uuid[])", [fixtureBusinesses]);
      await pool.query("delete from public.collection_plans where business_id = any($1::uuid[])", [fixtureBusinesses]);
      await pool.query("delete from public.invoices where business_id = any($1::uuid[])", [fixtureBusinesses]);
      await pool.query("delete from public.customers where business_id = any($1::uuid[])", [fixtureBusinesses]);
    }
    if (fixtureBusinesses.length) {
      await pool.query("delete from public.businesses where id = any($1::uuid[])", [fixtureBusinesses]);
    }
    if (fixtureUsers.length) {
      await pool.query("delete from public.users where id = any($1::uuid[])", [fixtureUsers]);
    }
  });

  it("applies all versioned migrations and records their versions", async () => {
    const result = await pool.query("select version from public.schema_migrations order by version");
    expect(result.rows.map((row) => row.version)).toEqual([
      "001_initial_schema.sql",
      "002_invoice_documents.sql",
    ]);
  });

  it("resolves only the authenticated user's business and prevents cross-business customer reads", async () => {
    const firstDb = createUserDatabase(fixtureUsers[0]);
    const secondDb = createUserDatabase(fixtureUsers[1]);
    const ownBusiness = await findBusinessForOwner(firstDb, fixtureUsers[0]);
    expect(ownBusiness.data.id).toBe(fixtureBusinesses[0]);
    expect(ownBusiness.data.id).not.toBe(fixtureBusinesses[1]);

    const customer = await createCustomer(firstDb, fixtureBusinesses[0], { name: "Scoped customer" });
    expect(customer.error).toBeNull();
    const crossBusinessCustomer = await getCustomer(secondDb, fixtureBusinesses[1], customer.data.id);
    expect(crossBusinessCustomer.data).toBeNull();
  });

  it("enforces matching business-scoped composite foreign keys", async () => {
    await expect(pool.query(
      `insert into public.collection_plan_items
       (business_id,plan_id,customer_id,invoice_id,recommended_amount_paise)
       values ($1,$2,$3,$4,100)`,
      [fixtureBusinesses[1], fixturePlans[0], fixtureCustomers[1], fixtureInvoices[1]],
    )).rejects.toMatchObject({ code: "23503" });
  });
});
