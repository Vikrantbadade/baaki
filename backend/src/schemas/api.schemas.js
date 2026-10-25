import { z } from "zod";

const uuid = z.string().uuid();
const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
};
const optionalText = (max = 500) => z.string().trim().max(max).optional();
const addressSchema = z
  .object({
    line1: optionalText(200),
    line2: optionalText(200),
    city: optionalText(100),
    state: optionalText(100),
    postalCode: optionalText(20),
    country: z.string().trim().length(2).default("IN"),
  })
  .strict();

export const emptySchema = z.object({
  params: z.object({}),
  query: z.object({}),
  body: z.object({}),
});

export const businessCreateSchema = z.object({
  params: z.object({}),
  query: z.object({}),
  body: z
    .object({
      name: z.string().trim().min(1).max(200),
      legalName: optionalText(200),
      gstin: optionalText(15),
      address: addressSchema.optional(),
      invoiceSettings: z.record(z.string(), z.unknown()).default({}),
    })
    .strict(),
});

export const businessUpdateSchema = z.object({
  params: z.object({}),
  query: z.object({}),
  body: z
    .object({
      name: z.string().trim().min(1).max(200).optional(),
      legalName: optionalText(200),
      gstin: optionalText(15),
      address: addressSchema.optional(),
      invoiceSettings: z.record(z.string(), z.unknown()).optional(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, "At least one field must be supplied"),
});

const customerBody = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(254).optional(),
    phone: optionalText(32),
    address: addressSchema.optional(),
    taxId: optionalText(30),
    notes: optionalText(2000),
  })
  .strict();

export const customerCreateSchema = z.object({
  params: z.object({}),
  query: z.object({}),
  body: customerBody,
});

export const customerListSchema = z.object({
  params: z.object({}),
  query: z.object({
    ...pagination,
    search: z.string().trim().max(100).optional(),
  }),
  body: z.object({}),
});

export const customerIdSchema = z.object({
  params: z.object({ customerId: uuid }),
  query: z.object({}),
  body: z.object({}),
});

export const customerUpdateSchema = z.object({
  params: z.object({ customerId: uuid }),
  query: z.object({}),
  body: customerBody.partial().strict().refine((body) => Object.keys(body).length > 0),
});

export const invoiceItemSchema = z
  .object({
    description: z.string().trim().min(1).max(500),
    quantityMilli: z.number().int().min(1).max(100000000),
    unitPricePaise: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    discountBps: z.number().int().min(0).max(10000).default(0),
    taxRateBps: z.number().int().min(0).max(10000).default(0),
  })
  .strict();

const invoiceBodyBase = z
  .object({
    customerId: uuid,
    issueDate: z.string().date().optional(),
    dueDate: z.string().date().optional(),
    notes: optionalText(4000),
    items: z.array(invoiceItemSchema).min(1).max(100),
  })
  .strict();

const invoiceBody = invoiceBodyBase.refine(
  (body) => !body.issueDate || !body.dueDate || body.dueDate >= body.issueDate,
  { message: "Due date must be on or after the issue date", path: ["dueDate"] },
);

export const invoicePreviewSchema = z.object({
  params: z.object({}),
  query: z.object({}),
  body: z.object({ items: z.array(invoiceItemSchema).min(1).max(100) }).strict(),
});

export const invoiceCreateSchema = z.object({
  params: z.object({}),
  query: z.object({}),
  body: invoiceBody,
});

export const invoiceListSchema = z.object({
  params: z.object({}),
  query: z.object({
    ...pagination,
    status: z.enum(["draft", "issued", "partially_paid", "paid", "cancelled"]).optional(),
    customerId: uuid.optional(),
    from: z.string().date().optional(),
    to: z.string().date().optional(),
    financialYear: z.coerce.number().int().min(2000).max(9999).optional(),
  }).refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: "from must be on or before to",
    path: ["to"],
  }),
  body: z.object({}),
});

export const invoiceIdSchema = z.object({
  params: z.object({ invoiceId: uuid }),
  query: z.object({}),
  body: z.object({}),
});

export const invoiceTimelineSchema = z.object({
  params: z.object({ invoiceId: uuid }),
  query: z.object(pagination),
  body: z.object({}),
});

export const documentDownloadSchema = z.object({
  params: z.object({ documentId: uuid }),
  query: z.object({}),
  body: z.object({}),
});

export const invoiceUpdateSchema = z.object({
  params: z.object({ invoiceId: uuid }),
  query: z.object({}),
  body: invoiceBodyBase
    .partial()
    .strict()
    .refine((body) => Object.keys(body).length > 0)
    .refine((body) => !body.issueDate || !body.dueDate || body.dueDate >= body.issueDate, {
      message: "Due date must be on or after the issue date",
      path: ["dueDate"],
    }),
});

export const invoiceCancelSchema = z.object({
  params: z.object({ invoiceId: uuid }),
  query: z.object({}),
  body: z.object({ reason: z.string().trim().min(3).max(1000) }).strict(),
});

const allocationSchema = z
  .object({
    invoiceId: uuid,
    amountPaise: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

export const paymentCreateSchema = z.object({
  params: z.object({}),
  query: z.object({}),
  body: z
    .object({
      customerId: uuid,
      amountPaise: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      method: z.enum(["cash", "bank_transfer", "cheque", "other"]),
      receivedAt: z.string().datetime().optional(),
      reference: optionalText(200),
      allocations: z.array(allocationSchema).max(100).default([]),
    })
    .strict(),
});

export const paymentListSchema = z.object({
  params: z.object({}),
  query: z.object(pagination),
  body: z.object({}),
});

export const paymentIdSchema = z.object({
  params: z.object({ paymentId: uuid }),
  query: z.object({}),
  body: z.object({}),
});

export const allocationCreateSchema = z.object({
  params: z.object({ paymentId: uuid }),
  query: z.object({}),
  body: z.object({ allocations: z.array(allocationSchema).min(1).max(100) }).strict(),
});

export const cashSnapshotCreateSchema = z.object({
  params: z.object({}),
  query: z.object({}),
  body: z
    .object({
      amountPaise: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
      recordedAt: z.string().datetime().optional(),
    })
    .strict(),
});

export const cashEntryCreateSchema = z.object({
  params: z.object({}),
  query: z.object({}),
  body: z
    .object({
      direction: z.enum(["inflow", "outflow"]),
      amountPaise: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      dueDate: z.string().date(),
      category: z.string().trim().min(1).max(100),
      description: optionalText(500),
      isActual: z.boolean().default(false),
    })
    .strict(),
});

export const cashEntryListSchema = z.object({
  params: z.object({}),
  query: z.object({
    ...pagination,
    from: z.string().date().optional(),
    to: z.string().date().optional(),
  }),
  body: z.object({}),
});

export const cashEntryIdSchema = z.object({
  params: z.object({ entryId: uuid }),
  query: z.object({}),
  body: z.object({}),
});

export const cashEntryUpdateSchema = z.object({
  params: z.object({ entryId: uuid }),
  query: z.object({}),
  body: z
    .object({
      direction: z.enum(["inflow", "outflow"]).optional(),
      amountPaise: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
      dueDate: z.string().date().optional(),
      category: z.string().trim().min(1).max(100).optional(),
      description: optionalText(500),
      isActual: z.boolean().optional(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0),
});

export const forecastSchema = z.object({
  params: z.object({}),
  query: z.object({}),
  body: z.object({
    horizonDays: z.number().int().min(1).max(365).default(90),
    startDate: z.string().date().optional(),
  }).strict(),
});

export const voiceInterpretationSchema = z.object({
  params: z.object({}),
  query: z.object({}),
  body: z
    .object({
      transcript: z.string().trim().max(5000).optional(),
      audioBase64: z.string().optional(),
      audioMimeType: optionalText(50),
      language: optionalText(10),
    })
    .strict()
    .refine(
      (body) => Boolean(body.transcript || body.audioBase64),
      "Either transcript or audioBase64 must be provided",
    ),
});

export const collectionPlanPreviewSchema = z.object({
  params: z.object({}),
  query: z.object({}),
  body: z
    .object({
      targetPaise: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
      targetRupees: z.number().positive().max(Number.MAX_SAFE_INTEGER).optional(),
      deadlineDays: z.number().int().min(1).max(365).default(7),
      customerIds: z.array(uuid).max(100).optional(),
    })
    .strict()
    .refine(
      (body) => body.targetPaise !== undefined || body.targetRupees !== undefined,
      "Either targetPaise or targetRupees must be provided",
    ),
});

export const collectionPlanCreateSchema = z.object({
  params: z.object({}),
  query: z.object({}),
  body: z
    .object({
      targetPaise: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      deadlineDays: z.number().int().min(1).max(365),
      selectedOption: z.number().int().min(1).max(10).default(1),
      strategy: z.string().trim().min(1).max(100),
      items: z
        .array(
          z.object({
            customerId: uuid,
            invoiceId: uuid,
            recommendedAmountPaise: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
            probability: z.number().min(0).max(1).optional(),
          }),
        )
        .min(1)
        .max(100),
    })
    .strict(),
});

export const collectionPlanListSchema = z.object({
  params: z.object({}),
  query: z.object({
    ...pagination,
    status: z
      .enum(["proposed", "approved", "rejected", "executing", "completed", "cancelled"])
      .optional(),
  }),
  body: z.object({}),
});

export const collectionPlanIdSchema = z.object({
  params: z.object({ planId: uuid }),
  query: z.object({}),
  body: z.object({}),
});

export const collectionPlanRejectSchema = z.object({
  params: z.object({ planId: uuid }),
  query: z.object({}),
  body: z
    .object({
      reason: optionalText(500),
    })
    .strict(),
});

