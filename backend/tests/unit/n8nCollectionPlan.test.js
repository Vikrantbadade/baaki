import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCollectionPlan, executePlanWithReminders, deliverN8nEvent } = vi.hoisted(() => ({
  getCollectionPlan: vi.fn(),
  executePlanWithReminders: vi.fn(),
  deliverN8nEvent: vi.fn(),
}));

vi.mock("../../src/repositories/collectionPlans.repository.js", () => ({
  getCollectionPlan,
  executePlanWithReminders,
  getInvoicesForPlanning: vi.fn(),
  insertCollectionPlan: vi.fn(),
  insertCollectionPlanItems: vi.fn(),
  createCollectionPlanWithItems: vi.fn(),
  listCollectionPlans: vi.fn(),
  updateCollectionPlan: vi.fn(),
  insertPlanReminders: vi.fn(),
}));
vi.mock("../../src/services/n8n.service.js", () => ({ deliverN8nEvent }));

import { executeCollectionPlan } from "../../src/services/collectionPlanner.service.js";

const planId = "00000000-0000-4000-8000-000000000001";
const businessId = "00000000-0000-4000-8000-000000000002";
const reminder = {
  id: "00000000-0000-4000-8000-000000000003",
  invoice_id: "00000000-0000-4000-8000-000000000004",
  channel: "whatsapp",
  scheduled_at: "2026-10-25T14:00:00.000Z",
};

describe("n8n collection plan event", () => {
  beforeEach(() => {
    getCollectionPlan.mockReset().mockResolvedValue({
      data: {
        id: planId,
        status: "approved",
        collection_plan_items: [{ invoiceId: reminder.invoice_id }],
      },
      error: null,
    });
    executePlanWithReminders.mockReset().mockResolvedValue({
      plan: { id: planId, status: "executing" },
      reminders: [reminder],
    });
    deliverN8nEvent.mockReset().mockResolvedValue({
      status: "failed",
      eventId: `collection-plan:${planId}:reminders:v1`,
      errorCode: "N8N_UPSTREAM_ERROR",
    });
  });

  it("publishes only committed reminder identifiers and reports automation failure separately", async () => {
    const result = await executeCollectionPlan({}, businessId, planId, "request-id");

    expect(executePlanWithReminders).toHaveBeenCalledOnce();
    expect(deliverN8nEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: `collection-plan:${planId}:reminders:v1`,
        eventType: "collection_plan.reminders_requested",
        version: 1,
        businessId,
        data: {
          collectionPlanId: planId,
          reminders: [{
            reminderId: reminder.id,
            invoiceId: reminder.invoice_id,
            channel: reminder.channel,
            scheduledAt: reminder.scheduled_at,
          }],
        },
      }),
      { requestId: "request-id" },
    );
    expect(result.plan.status).toBe("executing");
    expect(result.remindersScheduled).toBe(1);
    expect(result.automation).toMatchObject({
      status: "failed",
      errorCode: "N8N_UPSTREAM_ERROR",
    });
    expect(JSON.stringify(deliverN8nEvent.mock.calls)).not.toContain("customerName");
    expect(JSON.stringify(deliverN8nEvent.mock.calls)).not.toContain("phone");
  });

  it("does not publish an event when the plan is not visible in the authenticated business", async () => {
    getCollectionPlan.mockResolvedValue({ data: null, error: null });

    await expect(executeCollectionPlan({}, businessId, planId, "request-id"))
      .rejects.toMatchObject({ status: 404, code: "COLLECTION_PLAN_NOT_FOUND" });
    expect(executePlanWithReminders).not.toHaveBeenCalled();
    expect(deliverN8nEvent).not.toHaveBeenCalled();
  });
});
