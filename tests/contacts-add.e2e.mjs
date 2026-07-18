/**
 * Regression tests for the solo contact add flow (POST /api/contacts).
 *
 * Covers the TODO "Tekil (Solo) kullanıcı ekleme hatası" scenarios: single add,
 * multiple sequential adds, invalid input, and the list-aware behaviour (an
 * existing email is updated + added to the list instead of rejected with 409).
 *
 * Run against a dev server:   pnpm dev   then   node --env-file=.env tests/contacts-add.e2e.mjs
 * Target another deployment:  APP=https://... node --env-file=.env tests/contacts-add.e2e.mjs
 *
 * Requires NUXT_PUBLIC_SUPABASE_URL / NUXT_PUBLIC_SUPABASE_KEY /
 * NUXT_SUPABASE_SECRET_KEY in the env. Creates (and reuses) a confirmed test
 * user + throwaway contacts/list, all cleaned up at the end.
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = required('NUXT_PUBLIC_SUPABASE_URL')
const ANON_KEY = required('NUXT_PUBLIC_SUPABASE_KEY')
const SERVICE_KEY = required('NUXT_SUPABASE_SECRET_KEY')
const APP = process.env.APP || 'http://localhost:3000'

function required(name) {
  const v = process.env[name]
  if (!v) {
    console.error(`Missing env var ${name}`)
    process.exit(1)
  }
  return v
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})
const anon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false },
})

/* ---------- session cookie (matches @supabase/ssr's encoding) ---------- */

const PROJECT_REF = new URL(SUPABASE_URL).hostname.split('.')[0]
const COOKIE_NAME = `sb-${PROJECT_REF}-auth-token`
const MAX_CHUNK_SIZE = 3180

function sessionCookieHeader(session) {
  const encoded =
    'base64-' +
    Buffer.from(JSON.stringify(session)).toString('base64url')
  if (encoded.length <= MAX_CHUNK_SIZE) {
    return `${COOKIE_NAME}=${encoded}`
  }
  const parts = []
  for (let i = 0; i * MAX_CHUNK_SIZE < encoded.length; i++) {
    parts.push(
      `${COOKIE_NAME}.${i}=${encoded.slice(i * MAX_CHUNK_SIZE, (i + 1) * MAX_CHUNK_SIZE)}`,
    )
  }
  return parts.join('; ')
}

/* ---------- test user + HTTP helper ---------- */

const TEST_EMAIL = 'contacts-add-e2e@example.com'
const TEST_PASS = 'contacts-add-e2e-pass-123!'

async function ensureTestUser() {
  const { error } = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASS,
    email_confirm: true,
  })
  if (error && !/already/i.test(error.message)) throw error
}

let Cookie = ''
async function signIn() {
  const { data, error } = await anon.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASS,
  })
  if (error) throw error
  Cookie = sessionCookieHeader(data.session)
}

async function api(method, path, body, { auth = true } = {}) {
  const res = await fetch(`${APP}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(auth ? { Cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let json = null
  try {
    json = await res.json()
  } catch {
    /* no body */
  }
  return { status: res.status, json }
}

/* ---------- tiny assertion harness ---------- */

let passed = 0
let failed = 0
function check(name, ok, detail) {
  if (ok) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.error(`  ✗ ${name}${detail ? ` — ${JSON.stringify(detail)}` : ''}`)
  }
}

/* ---------- fixtures ---------- */

const EMAILS = [
  'e2e-solo-new@example.com',
  'e2e-solo-dup@example.com',
  'e2e-solo-list-new@example.com',
  'e2e-solo-list-existing@example.com',
  'e2e-solo-restored@example.com',
  'e2e-multi-1@example.com',
  'e2e-multi-2@example.com',
  'e2e-multi-3@example.com',
]
const LIST_NAME = 'e2e-solo-add-list'

async function cleanup() {
  await admin.from('contacts').delete().in('email', EMAILS)
  await admin.from('lists').delete().eq('name', LIST_NAME)
}

/* ---------- tests ---------- */

await ensureTestUser()
await signIn()
await cleanup()

console.log(`Running against ${APP}\n`)

console.log('auth guard')
{
  const r = await api('POST', '/api/contacts', { email: EMAILS[0] }, { auth: false })
  check('unauthenticated POST → 401', r.status === 401, r)
}

console.log('single add')
{
  const r = await api('POST', '/api/contacts', {
    email: EMAILS[0],
    firstName: 'Solo',
    lastName: 'New',
    attributes: { company: 'Acme' },
  })
  check('new contact → 201', r.status === 201, r)
  check('fields persisted', r.json?.first_name === 'Solo' && r.json?.attributes?.company === 'Acme', r.json)
}

console.log('duplicate without list')
{
  await api('POST', '/api/contacts', { email: EMAILS[1] })
  const r = await api('POST', '/api/contacts', { email: EMAILS[1] })
  check('active duplicate → 409', r.status === 409, r)
}

console.log('invalid input')
{
  const bad = await api('POST', '/api/contacts', { email: 'not-an-email' })
  check('malformed email → 400', bad.status === 400, bad)
  const missing = await api('POST', '/api/contacts', { firstName: 'NoMail' })
  check('missing email → 400', missing.status === 400, missing)
  const badList = await api('POST', '/api/contacts', {
    email: EMAILS[2],
    listId: 'not-a-uuid',
  })
  check('malformed listId → 400', badList.status === 400, badList)
}

console.log('list-aware add')
let listId
{
  const created = await api('POST', '/api/lists', { name: LIST_NAME })
  listId = created.json?.id
  check('fixture list created', created.status === 201 && !!listId, created)

  const r = await api('POST', '/api/contacts', { email: EMAILS[2], listId })
  check('new contact with listId → 201', r.status === 201, r)
  const { data: m1 } = await admin
    .from('list_contacts')
    .select('contact_id')
    .eq('list_id', listId)
    .eq('contact_id', r.json?.id)
  check('membership created', m1?.length === 1, m1)
}
{
  // The reported bug: an email that already exists must be addable to a list
  // solo (no CSV import), updating instead of erroring.
  const first = await api('POST', '/api/contacts', {
    email: EMAILS[3],
    firstName: 'Old',
    attributes: { plan: 'free', legacy: 'keep-me' },
  })
  check('pre-existing contact seeded', first.status === 201, first)

  const r = await api('POST', '/api/contacts', {
    email: EMAILS[3],
    firstName: 'Updated',
    attributes: { plan: 'pro' },
    listId,
  })
  check('existing contact with listId → 200 (not 409)', r.status === 200, r)
  check('name updated', r.json?.first_name === 'Updated', r.json)
  check(
    'attributes merged (new wins, old kept)',
    r.json?.attributes?.plan === 'pro' && r.json?.attributes?.legacy === 'keep-me',
    r.json?.attributes,
  )
  const { data: m } = await admin
    .from('list_contacts')
    .select('contact_id')
    .eq('list_id', listId)
    .eq('contact_id', r.json?.id)
  check('membership added', m?.length === 1, m)

  const again = await api('POST', '/api/contacts', { email: EMAILS[3], listId })
  check('already in list → 409', again.status === 409, again)
  check(
    'says "already in this list"',
    /already in this list/i.test(again.json?.statusMessage ?? ''),
    again.json,
  )
}
{
  // Soft-deleted contacts are restored, and still join the list.
  const seed = await api('POST', '/api/contacts', { email: EMAILS[4] })
  await api('DELETE', `/api/contacts/${seed.json?.id}`)
  const r = await api('POST', '/api/contacts', {
    email: EMAILS[4],
    firstName: 'Back',
    listId,
  })
  check('soft-deleted restored → 200', r.status === 200, r)
  check('restored active', r.json?.status === 'active' && r.json?.deleted_at === null, r.json)
  const { data: m } = await admin
    .from('list_contacts')
    .select('contact_id')
    .eq('list_id', listId)
    .eq('contact_id', r.json?.id)
  check('restored contact joined list', m?.length === 1, m)
}
{
  const r = await api('POST', '/api/contacts', {
    email: 'e2e-ghost@example.com',
    listId: '00000000-0000-0000-0000-000000000000',
  })
  check('unknown listId → 404', r.status === 404, r)
}

console.log('multiple sequential adds')
{
  const results = []
  for (const email of EMAILS.slice(5)) {
    results.push(await api('POST', '/api/contacts', { email, listId }))
  }
  check('all three → 201', results.every((r) => r.status === 201), results.map((r) => r.status))
  const ids = results.map((r) => r.json?.id)
  const { data: m } = await admin
    .from('list_contacts')
    .select('contact_id')
    .eq('list_id', listId)
    .in('contact_id', ids)
  check('all three joined list', m?.length === 3, m)
}

await cleanup()
await anon.auth.signOut()

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
