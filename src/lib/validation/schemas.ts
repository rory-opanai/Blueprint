import { z } from "zod";

export const manualTasUpdateSchema = z.object({
  questionId: z.string().min(1),
  answer: z.string().min(3),
  actor: z.string().min(1),
  evidenceLinks: z.array(z.string().url()).default([])
});

export const suggestionDecisionSchema = z.object({
  action: z.enum(["accept", "edit_then_accept", "reject"]),
  actor: z.string().min(1),
  editedAnswer: z.string().min(3).optional(),
  rejectReason: z.enum(["irrelevant", "incorrect", "wrong_deal"]).optional(),
  idempotencyKey: z.string().min(8)
});

export const commitmentCreateSchema = z.object({
  opportunityId: z.string().min(1),
  title: z.string().min(3),
  owner: z.string().min(1),
  dueDate: z.string().datetime(),
  source: z.string().default("manual")
});

export const createDealSchema = z.object({
  accountName: z.string().min(2),
  opportunityName: z.string().min(2),
  stage: z.string().min(2),
  amount: z.number().nonnegative(),
  closeDate: z.string().datetime(),
  ownerName: z.string().min(2),
  ownerEmail: z.string().email(),
  createInSalesforce: z.boolean().optional().default(false),
  salesforceAccountId: z.string().min(1).optional()
});

export const sourceMappingConfirmSchema = z.object({
  opportunityId: z.string().min(1),
  sourceType: z.enum(["gong", "slack", "gmail", "email", "doc", "gtm_agent"]),
  sourceRef: z.string().min(1),
  confirmed: z.boolean(),
  actor: z.string().min(1)
});
