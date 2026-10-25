import { AppError } from "../errors/AppError.js";

function safeNumber(value, label) {
  if (
    value > BigInt(Number.MAX_SAFE_INTEGER) ||
    value < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new AppError(422, "AMOUNT_TOO_LARGE", `${label} exceeds the supported range`);
  }
  return Number(value);
}

export function sumPaise(values, label = "Total") {
  return safeNumber(values.reduce((sum, value) => sum + BigInt(value), 0n), label);
}

export function quantityToMilli(value) {
  const text = String(value);
  const match = text.match(/^(\d+)(?:\.(\d{1,3}))?$/);
  if (!match) {
    throw new AppError(422, "INVALID_QUANTITY", "Stored invoice quantity has unsupported precision");
  }
  const milli = BigInt(match[1]) * 1000n + BigInt((match[2] ?? "").padEnd(3, "0"));
  return safeNumber(milli, "Quantity");
}

export function calculateInvoiceTotals(items) {
  let subtotalPaise = 0n;
  let discountPaise = 0n;
  let taxPaise = 0n;

  const calculatedItems = items.map((item) => {
    const quantityMilli = BigInt(item.quantityMilli);
    const unitPrice = BigInt(item.unitPricePaise);
    const gross = (quantityMilli * unitPrice + 500n) / 1000n;
    const discount = (gross * BigInt(item.discountBps) + 5000n) / 10000n;
    const taxable = gross - discount;
    const tax = (taxable * BigInt(item.taxRateBps) + 5000n) / 10000n;

    subtotalPaise += gross;
    discountPaise += discount;
    taxPaise += tax;

    return {
      description: item.description,
      quantityMilli: item.quantityMilli,
      unitPricePaise: item.unitPricePaise,
      discountBps: item.discountBps,
      taxRateBps: item.taxRateBps,
      subtotalPaise: safeNumber(gross, "Line subtotal"),
      discountPaise: safeNumber(discount, "Line discount"),
      taxPaise: safeNumber(tax, "Line tax"),
      totalPaise: safeNumber(taxable + tax, "Line total"),
    };
  });

  const totalPaise = subtotalPaise - discountPaise + taxPaise;
  return {
    items: calculatedItems,
    subtotalPaise: safeNumber(subtotalPaise, "Subtotal"),
    discountPaise: safeNumber(discountPaise, "Discount"),
    taxPaise: safeNumber(taxPaise, "Tax"),
    totalPaise: safeNumber(totalPaise, "Invoice total"),
  };
}

export function projectCashflow(startingBalancePaise, entries, horizonDays, startDate) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime())) {
    throw new AppError(422, "INVALID_FORECAST_DATE", "Forecast start date is invalid");
  }

  let balance = BigInt(startingBalancePaise);
  const byDate = new Map();
  for (const entry of entries) {
    const amount = BigInt(entry.amount_paise);
    const row = byDate.get(entry.due_date) ?? {
      actualInflow: 0n,
      actualOutflow: 0n,
      estimatedInflow: 0n,
      estimatedOutflow: 0n,
    };
    const key = `${entry.is_actual ? "actual" : "estimated"}${entry.direction === "inflow" ? "Inflow" : "Outflow"}`;
    row[key] += amount;
    byDate.set(entry.due_date, row);
  }

  const dailyBalances = [];
  let shortageDate = null;
  let cashGapPaise = 0n;
  for (let day = 0; day < horizonDays; day += 1) {
    const date = new Date(start.getTime() + day * 86400000).toISOString().slice(0, 10);
    const movements = byDate.get(date) ?? {
      actualInflow: 0n,
      actualOutflow: 0n,
      estimatedInflow: 0n,
      estimatedOutflow: 0n,
    };
    balance += movements.actualInflow + movements.estimatedInflow - movements.actualOutflow - movements.estimatedOutflow;
    if (balance < 0n && shortageDate === null) {
      shortageDate = date;
      cashGapPaise = -balance;
    } else if (balance < 0n && -balance > cashGapPaise) {
      cashGapPaise = -balance;
    }
    dailyBalances.push({
      date,
      actualInflowPaise: safeNumber(movements.actualInflow, "Actual inflow"),
      actualOutflowPaise: safeNumber(movements.actualOutflow, "Actual outflow"),
      estimatedInflowPaise: safeNumber(movements.estimatedInflow, "Estimated inflow"),
      estimatedOutflowPaise: safeNumber(movements.estimatedOutflow, "Estimated outflow"),
      projectedBalancePaise: safeNumber(balance, "Projected balance"),
    });
  }

  return {
    startingBalancePaise,
    horizonDays,
    dailyBalances,
    shortageDate,
    cashGapPaise: safeNumber(cashGapPaise, "Cash gap"),
    isEstimate: true,
  };
}
