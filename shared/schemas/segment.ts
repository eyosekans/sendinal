import { z } from 'zod'

/**
 * Segment rules (task 3.2). A campaign can narrow its target list down to the
 * contacts matching a set of conditions, combined with AND logic. Rules are
 * stored inline on `campaigns.segment_rules` (no separate table) and evaluated
 * identically at preview time (`POST /api/segments/preview`) and at dispatch
 * (`worker/processors/campaign-dispatch.ts`) via `matchesSegmentRules` in
 * `shared/segments.ts`.
 *
 * Scope (3.2 "easy" fields): profile columns + custom attributes. Activity
 * fields (`last_opened_at` / `last_clicked_at`) are deferred — they need an
 * `email_events` join and arguably a denormalised column.
 */

export const SEGMENT_OPERATORS = [
  'equals',
  'contains',
  'greater_than',
  'less_than',
  'is_set',
  'is_not_set',
] as const
export const segmentOperatorSchema = z.enum(SEGMENT_OPERATORS)
export type SegmentOperator = z.infer<typeof segmentOperatorSchema>

/** Operators that compare against a value (the rest test presence only). */
export const SEGMENT_VALUE_OPERATORS: SegmentOperator[] = [
  'equals',
  'contains',
  'greater_than',
  'less_than',
]

/** Human labels for the builder UI. */
export const SEGMENT_OPERATOR_LABELS: Record<SegmentOperator, string> = {
  equals: 'equals',
  contains: 'contains',
  greater_than: 'greater than',
  less_than: 'less than',
  is_set: 'is set',
  is_not_set: 'is not set',
}

/** Fixed profile fields selectable in the builder (besides `attributes.*`). */
export const SEGMENT_PROFILE_FIELDS = [
  { value: 'email', label: 'Email' },
  { value: 'first_name', label: 'First name' },
  { value: 'last_name', label: 'Last name' },
  { value: 'status', label: 'Status' },
] as const

const PROFILE_FIELD_KEYS = SEGMENT_PROFILE_FIELDS.map((f) => f.value) as string[]

/** A field is either a known profile column or an `attributes.<key>` path. */
const segmentFieldSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (f) =>
      PROFILE_FIELD_KEYS.includes(f) ||
      /^attributes\.[A-Za-z0-9_-]+$/.test(f),
    { message: 'Unknown segment field' },
  )

export const segmentRuleSchema = z
  .object({
    field: segmentFieldSchema,
    operator: segmentOperatorSchema,
    // Comparison value — required for value operators, ignored for is_set/is_not_set.
    value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  })
  .superRefine((rule, ctx) => {
    if (
      SEGMENT_VALUE_OPERATORS.includes(rule.operator) &&
      (rule.value === undefined ||
        rule.value === null ||
        (typeof rule.value === 'string' && rule.value.trim() === ''))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'A value is required for this operator',
      })
    }
  })
export type SegmentRule = z.infer<typeof segmentRuleSchema>

/**
 * The full segment definition stored on a campaign. `match` is fixed to `all`
 * (AND) for now; the shape leaves room for `any` (OR) later. An empty
 * `rules` array (or a legacy `{}` value) means "no segment — the whole list".
 */
export const segmentRulesSchema = z.object({
  match: z.literal('all').default('all'),
  rules: z.array(segmentRuleSchema).max(20).default([]),
})
export type SegmentRules = z.infer<typeof segmentRulesSchema>

/** Body for POST /api/segments/preview — estimate recipients for a list + rules. */
export const segmentPreviewSchema = z.object({
  listId: z.string().uuid(),
  rules: segmentRulesSchema.default({ match: 'all', rules: [] }),
})
export type SegmentPreviewInput = z.infer<typeof segmentPreviewSchema>
