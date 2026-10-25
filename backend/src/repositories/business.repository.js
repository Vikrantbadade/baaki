import { withDatabaseContext } from "../utils/databaseResult.js";

export function findBusinessForOwner(db, ownerUserId) {
  return withDatabaseContext(
    db.query("select * from public.businesses where owner_user_id = $1", [ownerUserId]),
    "select",
    "businesses",
    { single: true },
  );
}

export function createBusiness(db, ownerUserId, business) {
  return withDatabaseContext(
    db.query(
      `insert into public.businesses (owner_user_id, name, legal_name, gstin, address, invoice_settings)
       values ($1, $2, $3, $4, $5, $6)
       returning *`,
      [
        ownerUserId,
        business.name,
        business.legal_name ?? null,
        business.gstin ?? null,
        JSON.stringify(business.address ?? {}),
        JSON.stringify(business.invoice_settings ?? {}),
      ],
    ),
    "insert",
    "businesses",
    { single: true },
  );
}

export function updateBusiness(db, businessId, patch) {
  const allowed = {
    name: "name",
    legal_name: "legal_name",
    gstin: "gstin",
    address: "address",
    invoice_settings: "invoice_settings",
  };
  const keys = Object.keys(patch).filter((key) => allowed[key]);
  const values = keys.map((key) => ["address", "invoice_settings"].includes(key) ? JSON.stringify(patch[key]) : patch[key]);
  const assignments = keys.map((key, index) => `${allowed[key]} = $${index + 1}${["address", "invoice_settings"].includes(key) ? "::jsonb" : ""}`);
  values.push(businessId);
  return withDatabaseContext(
    db.query(`update public.businesses set ${assignments.join(", ")} where id = $${values.length} returning *`, values),
    "update",
    "businesses",
    { single: true },
  );
}
