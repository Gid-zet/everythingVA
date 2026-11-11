import { z } from "zod";

/**
 * Organizer rules, adapted from Inbox Zero's rules engine
 * (github.com/elie222/inbox-zero, apps/web/utils/ai/choose-rule).
 */

export const ACTION_TYPES = ["LABEL", "ARCHIVE", "MARK_READ", "STAR", "MARK_SPAM", "DRAFT_REPLY"] as const;
export type RuleActionType = (typeof ACTION_TYPES)[number];

export const ruleActionSchema = z.object({
  type: z.enum(ACTION_TYPES),
  /** LABEL: label / category name */
  label: z.string().trim().min(1).max(60).optional(),
  /** DRAFT_REPLY: optional guidance for the drafted reply */
  content: z.string().max(2000).optional(),
});
export type RuleAction = z.infer<typeof ruleActionSchema>;

export const ruleInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    enabled: z.boolean().default(true),
    instructions: z.string().trim().max(2000).nullish(),
    from: z.string().trim().max(500).nullish(),
    to: z.string().trim().max(500).nullish(),
    subject: z.string().trim().max(500).nullish(),
    body: z.string().trim().max(500).nullish(),
    conditionalOperator: z.enum(["AND", "OR"]).default("AND"),
    actions: z.array(ruleActionSchema).min(1).max(6),
  })
  .refine((r) => r.instructions || r.from || r.to || r.subject || r.body, {
    message: "Add AI instructions or at least one pattern (from, to, subject or body).",
  })
  .refine((r) => r.actions.every((a) => a.type !== "LABEL" || a.label), {
    message: "Label actions need a label name.",
  });
export type RuleInput = z.infer<typeof ruleInputSchema>;

/** What a rule run did with each action, stored on RuleRun.actions (enables Undo). */
export interface ExecutedAction {
  type: RuleActionType;
  label?: string;
  status: "done" | "failed" | "skipped";
  error?: string;
  draftId?: string;
}

export type SystemType =
  | "TO_REPLY"
  | "NEWSLETTER"
  | "MARKETING"
  | "CALENDAR"
  | "RECEIPT"
  | "NOTIFICATION"
  | "COLD_EMAIL";

/** Starter rules (instructions adapted from Inbox Zero's presets). */
export const PRESET_RULES: {
  systemType: SystemType;
  name: string;
  instructions: string;
  actions: RuleAction[];
  enabled: boolean;
}[] = [
  {
    systemType: "TO_REPLY",
    name: "To Reply",
    instructions:
      "Emails from a real person that ask me a direct question, request something from me, or clearly expect a reply. Not newsletters, notifications or automated messages.",
    actions: [{ type: "LABEL", label: "To Reply" }],
    enabled: true,
  },
  {
    systemType: "NEWSLETTER",
    name: "Newsletter",
    instructions: "Newsletters, digests, blogs and publications I subscribed to.",
    actions: [{ type: "LABEL", label: "Newsletter" }],
    enabled: true,
  },
  {
    systemType: "MARKETING",
    name: "Marketing",
    instructions: "Promotions, sales, discounts, product announcements and other marketing emails.",
    actions: [{ type: "LABEL", label: "Marketing" }, { type: "ARCHIVE" }],
    enabled: true,
  },
  {
    systemType: "CALENDAR",
    name: "Calendar",
    instructions: "Meeting invitations, schedule changes, event reminders and calendar notifications.",
    actions: [{ type: "LABEL", label: "Calendar" }],
    enabled: true,
  },
  {
    systemType: "RECEIPT",
    name: "Receipt",
    instructions: "Receipts, invoices, order confirmations, payment and billing emails.",
    actions: [{ type: "LABEL", label: "Receipt" }],
    enabled: true,
  },
  {
    systemType: "NOTIFICATION",
    name: "Notification",
    instructions: "Automated alerts, status updates, security notices and system notifications.",
    actions: [{ type: "LABEL", label: "Notification" }],
    enabled: true,
  },
  {
    systemType: "COLD_EMAIL",
    name: "Cold Email",
    instructions:
      "Unsolicited sales or outreach from someone I have no prior relationship with (pitching services, link building, lead generation).",
    actions: [{ type: "LABEL", label: "Cold Email" }, { type: "ARCHIVE" }],
    enabled: false,
  },
];

/** Normalised message the matcher and AI see. */
export interface RuleMessage {
  id: string;
  threadId: string;
  from: { name?: string | null; address: string };
  to: { name?: string | null; address: string }[];
  subject: string;
  text: string;
  date: Date;
  hasListUnsubscribe: boolean;
}
