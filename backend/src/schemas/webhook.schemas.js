import { z } from "zod";

export const razorpayEventIdSchema = z.string().trim().min(1).max(200);
export const razorpayEventSchema = z
  .object({
    event: z.string().trim().min(1).max(200),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const n8nDeliverySchema = z
  .object({
    eventId: z.string().trim().min(1).max(200),
    reminderId: z.string().uuid(),
    status: z.enum(["delivered", "failed"]),
    providerReference: z.string().trim().max(200).optional(),
    result: z
      .object({
        code: z.string().trim().max(100).optional(),
        message: z.string().trim().max(500).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
