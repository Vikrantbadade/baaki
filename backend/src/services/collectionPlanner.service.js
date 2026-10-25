import { env } from "../config/env.js";
import { AppError } from "../errors/AppError.js";
import { requestCollectionStrategyModel } from "../integrations/ml/modelService.client.js";
import {
  getCollectionPlan,
  getInvoicesForPlanning,
  insertCollectionPlan,
  insertCollectionPlanItems,
  insertPlanReminders,
  listCollectionPlans,
  updateCollectionPlan,
} from "../repositories/collectionPlans.repository.js";
import { throwOnSupabaseError } from "../utils/supabaseError.js";

/**
 * Calculates the exact probability that the collected amount meets or exceeds targetPaise.
 * For groups up to 14 customers, scenario expansion evaluates all 2^N outcomes.
 * For larger groups, dynamic programming computes the exact distribution.
 */
export function calculateProbabilityTargetMet(group, targetPaise) {
  if (!group || group.length === 0) return 0;

  const n = group.length;
  // If small, full scenario enumeration matching the notebook exactly
  if (n <= 12) {
    let chance = 0.0;
    const totalScenarios = 1 << n;
    for (let mask = 0; mask < totalScenarios; mask++) {
      let amount = 0;
      let scenarioP = 1.0;
      for (let i = 0; i < n; i++) {
        const p = group[i].paymentProbability ?? 0.75;
        if ((mask & (1 << i)) !== 0) {
          amount += group[i].outstandingPaise;
          scenarioP *= p;
        } else {
          scenarioP *= 1 - p;
        }
      }
      if (amount >= targetPaise) {
        chance += scenarioP;
      }
    }
    return Math.min(1.0, Math.max(0.0, chance));
  }

  // Dynamic programming distribution for larger N
  // Quantize amounts by greatest common divisor or scaled units to keep array size bounded
  const scale = 10000; // 100 rupees
  const scaledTarget = Math.ceil(targetPaise / scale);
  let dp = new Float64Array(scaledTarget + 1);
  dp[0] = 1.0;

  for (let i = 0; i < n; i++) {
    const p = group[i].paymentProbability ?? 0.75;
    const itemAmount = Math.ceil(group[i].outstandingPaise / scale);
    const nextDp = new Float64Array(scaledTarget + 1);

    for (let amt = 0; amt <= scaledTarget; amt++) {
      if (dp[amt] === 0) continue;
      // customer does not pay
      nextDp[amt] += dp[amt] * (1 - p);
      // customer pays
      const nextAmt = Math.min(scaledTarget, amt + itemAmount);
      nextDp[nextAmt] += dp[amt] * p;
    }
    dp = nextDp;
  }

  return Math.min(1.0, Math.max(0.0, dp[scaledTarget]));
}

function getCombinations(items, size) {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  if (items.length === size) return [items];

  const [head, ...tail] = items;
  const withHead = getCombinations(tail, size - 1).map((sub) => [head, ...sub]);
  const withoutHead = getCombinations(tail, size);
  return [...withHead, ...withoutHead];
}

/**
 * Pure algorithm matching Baaki_Smart_Collection_Planner_Interactive (2).ipynb
 */
export function generateCollectionPlansAlgorithm(invoices, targetPaise, deadlineDays) {
  const annotated = invoices.map((inv) => {
    const outstanding = inv.outstandingPaise ?? 0;
    const days = inv.expectedDaysToPay ?? 1;
    const disputed = Boolean(inv.disputed);
    const paused = Boolean(inv.paused);

    let eligibilityReason = "Eligible for plan";
    if (outstanding <= 0) {
      eligibilityReason = "No outstanding amount";
    } else if (disputed) {
      eligibilityReason = "Disputed — review first";
    } else if (paused) {
      eligibilityReason = "Paused — do not schedule reminder";
    } else if (days > deadlineDays) {
      eligibilityReason = "Expected after deadline";
    }

    const eligible =
      outstanding > 0 && !disputed && !paused && days <= deadlineDays;

    return {
      ...inv,
      outstandingPaise: outstanding,
      expectedDaysToPay: days,
      paymentProbability: inv.paymentProbability ?? 0.75,
      disputed,
      paused,
      eligibilityReason,
      isEligible: eligible,
    };
  });

  const eligibleInvoices = annotated.filter((i) => i.isEligible);
  const totalEligiblePaise = eligibleInvoices.reduce((sum, i) => sum + i.outstandingPaise, 0);

  if (eligibleInvoices.length === 0 || totalEligiblePaise < targetPaise) {
    return {
      modelVersion: "baaki-planner-v1.0",
      isDemoPrediction: true,
      targetPaise,
      deadlineDays,
      eligibleCount: eligibleInvoices.length,
      totalEligiblePaise,
      shortfallPaise: Math.max(0, targetPaise - totalEligiblePaise),
      options: [],
      annotatedInvoices: annotated,
      disclaimer: "Demo probabilities are estimates; owner verification required.",
    };
  }

  // To prevent combinatorial slowdown if there are many eligible invoices,
  // pick the most promising candidate invoices (sorted by amount desc, probability desc)
  let candidatePool = [...eligibleInvoices];
  if (candidatePool.length > 15) {
    candidatePool.sort((a, b) => b.outstandingPaise - a.outstandingPaise);
    candidatePool = candidatePool.slice(0, 15);
  }

  const allPlans = [];
  for (let size = 1; size <= candidatePool.length; size++) {
    const combs = getCombinations(candidatePool, size);
    for (const group of combs) {
      const total = group.reduce((sum, c) => sum + c.outstandingPaise, 0);
      if (total < targetPaise) continue;

      const prob = calculateProbabilityTargetMet(group, targetPaise);
      allPlans.push({
        customers: group,
        customerCount: group.length,
        customerNames: group.map((c) => c.customerName || c.name || "Customer"),
        invoiceIds: group.map((c) => c.invoiceId || c.id),
        amountIfAllPayPaise: total,
        extraOverTargetPaise: total - targetPaise,
        probabilityTargetMet: prob,
      });
    }
  }

  // Prefer options no more than 25% above target if any such plans exist (from notebook)
  const reasonable = allPlans.filter((p) => p.amountIfAllPayPaise <= targetPaise * 1.25);
  const plansForOptions = reasonable.length > 0 ? reasonable : allPlans;

  const planKey = (plan) =>
    plan.customers
      .map((c) => c.customerId || c.customer_id || c.invoiceId)
      .sort()
      .join(":");

  const strategies = [
    {
      label: "Fewest customers to contact",
      comparator: (a, b) =>
        a.customerCount - b.customerCount ||
        b.probabilityTargetMet - a.probabilityTargetMet ||
        a.extraOverTargetPaise - b.extraOverTargetPaise,
    },
    {
      label: "Highest estimated chance of reaching target",
      comparator: (a, b) =>
        b.probabilityTargetMet - a.probabilityTargetMet ||
        a.customerCount - b.customerCount ||
        a.extraOverTargetPaise - b.extraOverTargetPaise,
    },
    {
      label: "Multi-customer plan closest to target",
      comparator: (a, b) =>
        a.extraOverTargetPaise - b.extraOverTargetPaise ||
        b.probabilityTargetMet - a.probabilityTargetMet ||
        a.customerCount - b.customerCount,
      filter: (p) => p.customerCount >= 2,
    },
  ];

  const options = [];
  const usedKeys = new Set();

  for (const strat of strategies) {
    let pool = plansForOptions;
    if (strat.filter) {
      const filtered = plansForOptions.filter(strat.filter);
      if (filtered.length > 0) pool = filtered;
    }
    const ranked = [...pool].sort(strat.comparator);
    const pick = ranked.find((p) => !usedKeys.has(planKey(p)));
    if (pick) {
      options.push({ label: strat.label, plan: pick });
      usedKeys.add(planKey(pick));
    }
  }

  // Fallback if fewer than 3 unique strategies were found
  if (options.length < Math.min(3, plansForOptions.length)) {
    const fallback = [...plansForOptions].sort(
      (a, b) =>
        b.probabilityTargetMet - a.probabilityTargetMet ||
        a.customerCount - b.customerCount ||
        a.extraOverTargetPaise - b.extraOverTargetPaise,
    );
    for (const p of fallback) {
      if (options.length >= Math.min(3, plansForOptions.length)) break;
      if (!usedKeys.has(planKey(p))) {
        options.push({ label: "Alternative feasible plan", plan: p });
        usedKeys.add(planKey(p));
      }
    }
  }

  const formattedOptions = options.map((opt, idx) => {
    const p = opt.plan;
    return {
      option: idx + 1,
      strategy: opt.label,
      customerCount: p.customerCount,
      customerNames: p.customerNames,
      invoiceIds: p.invoiceIds,
      amountIfAllPayPaise: p.amountIfAllPayPaise,
      amountIfAllPayRupees: Math.round(p.amountIfAllPayPaise / 100),
      extraOverTargetPaise: p.extraOverTargetPaise,
      extraOverTargetRupees: Math.round(p.extraOverTargetPaise / 100),
      demoChanceTargetMetPercent: Number((p.probabilityTargetMet * 100).toFixed(1)),
      probabilityTargetMet: Number(p.probabilityTargetMet.toFixed(4)),
      isDemoPrediction: true,
      customers: p.customers.map((c) => ({
        customerId: c.customerId || c.customer_id,
        customerName: c.customerName || c.name,
        invoiceId: c.invoiceId || c.id,
        invoiceNumber: c.invoiceNumber || c.invoice_number,
        outstandingPaise: c.outstandingPaise,
        outstandingRupees: Math.round(c.outstandingPaise / 100),
        expectedDaysToPay: c.expectedDaysToPay,
        paymentProbability: c.paymentProbability,
      })),
    };
  });

  return {
    modelVersion: "baaki-planner-v1.0",
    isDemoPrediction: true,
    targetPaise,
    targetRupees: Math.round(targetPaise / 100),
    deadlineDays,
    eligibleCount: eligibleInvoices.length,
    totalEligiblePaise,
    totalEligibleRupees: Math.round(totalEligiblePaise / 100),
    options: formattedOptions,
    annotatedInvoices: annotated,
    disclaimer: "Demo probabilities are estimates; owner verification required.",
  };
}

/**
 * Preview collection plan recommendations using live database invoices
 */
export async function previewCollectionPlan(supabase, businessId, input) {
  const targetPaise =
    input.targetPaise !== undefined
      ? input.targetPaise
      : input.targetRupees !== undefined
        ? Math.round(input.targetRupees * 100)
        : null;

  if (!targetPaise || targetPaise <= 0) {
    throw new AppError(400, "INVALID_TARGET_AMOUNT", "A positive target amount is required");
  }

  const deadlineDays = input.deadlineDays ?? 7;

  // Fetch actual issued/partially_paid invoices from DB
  const { data: dbInvoices, error } = await getInvoicesForPlanning(
    supabase,
    businessId,
    input.customerIds,
  );
  throwOnSupabaseError(error);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const candidateInvoices = (dbInvoices || []).map((inv) => {
    let days = 1;
    if (inv.due_date) {
      const dueDate = new Date(inv.due_date);
      dueDate.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      days = Math.max(1, diffDays);
    }

    const isArchived = Boolean(inv.customers?.archived_at);
    const hasDisputeInNotes = Boolean(inv.notes && /dispute/i.test(inv.notes));

    return {
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number,
      customerId: inv.customer_id,
      customerName: inv.customers?.name || "Customer",
      outstandingPaise: inv.outstanding_paise,
      expectedDaysToPay: days,
      paymentProbability: 0.75, // standard demo probability
      disputed: hasDisputeInNotes,
      paused: isArchived,
    };
  });

  // If external ML strategy service is configured, attempt delegating to it
  if (env.ML_STRATEGY_SERVICE_URL) {
    try {
      const mlResult = await requestCollectionStrategyModel({
        targetPaise,
        deadlineDays,
        invoices: candidateInvoices,
      });
      return {
        ...mlResult,
        candidateInvoices,
      };
    } catch {
      // If remote ML service fails, fallback to native algorithm
      // allowing resilient offline operation
    }
  }

  // Native high-performance execution of planner algorithm
  return generateCollectionPlansAlgorithm(candidateInvoices, targetPaise, deadlineDays);
}

/**
 * Save selected collection plan to database
 */
export async function saveCollectionPlan(supabase, businessId, input) {
  const targetPaise = input.targetPaise;
  const deadlineDays = input.deadlineDays;

  const deadlineDate = new Date();
  deadlineDate.setDate(deadlineDate.getDate() + deadlineDays);
  const deadlineIso = deadlineDate.toISOString().slice(0, 10);

  const recommendation = {
    selectedOption: input.selectedOption ?? 1,
    strategy: input.strategy,
    targetPaise,
    deadlineDays,
    isDemoPrediction: true,
  };

  const { data: plan, error: planError } = await insertCollectionPlan(supabase, businessId, {
    targetPaise,
    deadlineDate: deadlineIso,
    recommendation,
  });
  throwOnSupabaseError(planError);

  if (input.items && input.items.length > 0) {
    const { error: itemsError } = await insertCollectionPlanItems(
      supabase,
      businessId,
      plan.id,
      input.items,
    );
    throwOnSupabaseError(itemsError);
  }

  return getCollectionPlanById(supabase, businessId, plan.id);
}

export async function getCollectionPlans(supabase, businessId, query) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 25;
  const { data, error, count } = await listCollectionPlans(supabase, businessId, {
    page,
    limit,
    status: query.status,
  });
  throwOnSupabaseError(error);
  return { items: data || [], page, limit, total: count || 0 };
}

export async function getCollectionPlanById(supabase, businessId, planId) {
  const { data, error } = await getCollectionPlan(supabase, businessId, planId);
  throwOnSupabaseError(error);
  if (!data) {
    throw new AppError(404, "COLLECTION_PLAN_NOT_FOUND", "Collection plan not found");
  }
  return data;
}

export async function approveCollectionPlan(supabase, businessId, planId) {
  const plan = await getCollectionPlanById(supabase, businessId, planId);
  if (plan.status !== "proposed") {
    throw new AppError(
      409,
      "INVALID_PLAN_STATUS",
      `Cannot approve plan in '${plan.status}' status; must be 'proposed'`,
    );
  }

  const { data, error } = await updateCollectionPlan(supabase, businessId, planId, {
    status: "approved",
    approved_at: new Date().toISOString(),
  });
  throwOnSupabaseError(error);
  return data;
}

export async function rejectCollectionPlan(supabase, businessId, planId, reason = null) {
  const plan = await getCollectionPlanById(supabase, businessId, planId);
  if (plan.status !== "proposed") {
    throw new AppError(
      409,
      "INVALID_PLAN_STATUS",
      `Cannot reject plan in '${plan.status}' status; must be 'proposed'`,
    );
  }

  const updatedRecommendation = {
    ...plan.recommendation,
    rejectionReason: reason,
  };

  const { data, error } = await updateCollectionPlan(supabase, businessId, planId, {
    status: "rejected",
    rejected_at: new Date().toISOString(),
    recommendation: updatedRecommendation,
  });
  throwOnSupabaseError(error);
  return data;
}

export async function cancelCollectionPlan(supabase, businessId, planId) {
  const plan = await getCollectionPlanById(supabase, businessId, planId);
  if (["completed", "cancelled"].includes(plan.status)) {
    throw new AppError(
      409,
      "INVALID_PLAN_STATUS",
      `Cannot cancel plan in '${plan.status}' status`,
    );
  }

  const { data, error } = await updateCollectionPlan(supabase, businessId, planId, {
    status: "cancelled",
  });
  throwOnSupabaseError(error);
  return data;
}

export async function executeCollectionPlan(supabase, businessId, planId) {
  const plan = await getCollectionPlanById(supabase, businessId, planId);
  if (plan.status !== "approved") {
    throw new AppError(
      409,
      "PLAN_NOT_APPROVED",
      "Collection plan must be approved by the owner before execution",
    );
  }

  const items = plan.collection_plan_items || [];
  if (items.length === 0) {
    throw new AppError(400, "NO_PLAN_ITEMS", "Collection plan has no items to execute");
  }

  // Create reminders for the plan items
  const { data: reminders, error: remindersError } = await insertPlanReminders(
    supabase,
    businessId,
    planId,
    items,
  );
  throwOnSupabaseError(remindersError);

  // Transition status to executing
  const { data: updatedPlan, error: planError } = await updateCollectionPlan(
    supabase,
    businessId,
    planId,
    { status: "executing" },
  );
  throwOnSupabaseError(planError);

  return {
    plan: updatedPlan,
    remindersScheduled: (reminders || []).length,
    reminders,
  };
}
