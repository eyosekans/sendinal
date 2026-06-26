/**
 * Shared segment evaluator (task 3.2). The same logic runs in the Nitro preview
 * route and the BullMQ dispatch worker so the estimated recipient count always
 * matches who actually receives the campaign. Evaluation is in-app (the worker
 * already loads every list member into memory), keeping numeric/string operator
 * semantics consistent and migration-independent.
 *
 * Kept dependency-free (no relative imports) so it type-checks cleanly under
 * both the Nuxt "shared" layer (bundler resolution) and the worker (NodeNext) —
 * callers parse the raw `segment_rules` with `segmentRulesSchema` and pass the
 * typed rule array in. The Nuxt app imports `#shared/segments`; the worker
 * imports the concrete `shared/segments.ts`.
 */

/** Minimal contact shape the rules read from. `attributes` is the raw JSONB. */
export interface EvaluableContact {
  email: string | null
  first_name: string | null
  last_name: string | null
  status: string | null
  attributes: unknown
}

/** Structural rule shape (a parsed `SegmentRule` is assignable to this). */
export interface EvaluableRule {
  field: string
  operator: string
  value?: string | number | boolean
}

const ATTR_PREFIX = 'attributes.'

function fieldValue(contact: EvaluableContact, field: string): unknown {
  if (field.startsWith(ATTR_PREFIX)) {
    const attrs = contact.attributes
    if (attrs && typeof attrs === 'object' && !Array.isArray(attrs)) {
      return (attrs as Record<string, unknown>)[field.slice(ATTR_PREFIX.length)]
    }
    return undefined
  }
  switch (field) {
    case 'email':
      return contact.email
    case 'first_name':
      return contact.first_name
    case 'last_name':
      return contact.last_name
    case 'status':
      return contact.status
    default:
      return undefined
  }
}

function isSet(v: unknown): boolean {
  return v !== undefined && v !== null && String(v).trim() !== ''
}

function asText(v: unknown): string {
  return v === undefined || v === null ? '' : String(v).trim().toLowerCase()
}

/** Compare two raw values, preferring numeric then date then string ordering. */
function compare(a: unknown, b: unknown): number {
  const an = Number(a)
  const bn = Number(b)
  if (isSet(a) && isSet(b) && Number.isFinite(an) && Number.isFinite(bn)) {
    return an - bn
  }
  const ad = Date.parse(String(a))
  const bd = Date.parse(String(b))
  if (Number.isFinite(ad) && Number.isFinite(bd)) return ad - bd
  return asText(a).localeCompare(asText(b))
}

function matchRule(contact: EvaluableContact, rule: EvaluableRule): boolean {
  const v = fieldValue(contact, rule.field)
  switch (rule.operator) {
    case 'is_set':
      return isSet(v)
    case 'is_not_set':
      return !isSet(v)
    case 'equals': {
      const an = Number(v)
      const bn = Number(rule.value)
      if (isSet(v) && Number.isFinite(an) && Number.isFinite(bn)) {
        return an === bn
      }
      return asText(v) === asText(rule.value)
    }
    case 'contains':
      return asText(v).includes(asText(rule.value))
    case 'greater_than':
      return isSet(v) && compare(v, rule.value) > 0
    case 'less_than':
      return isSet(v) && compare(v, rule.value) < 0
    default:
      return false
  }
}

/**
 * True when a contact satisfies every rule (AND). An empty rule array matches
 * everyone, so a campaign with no segment targets its whole list. Callers parse
 * `segment_rules` with `segmentRulesSchema` first and pass `rules` here.
 */
export function matchesSegmentRules(
  contact: EvaluableContact,
  rules: readonly EvaluableRule[],
): boolean {
  if (!rules || rules.length === 0) return true
  return rules.every((r) => matchRule(contact, r))
}
