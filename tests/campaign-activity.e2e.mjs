/**
 * Regression tests for campaign detail filtering
 * (GET /api/campaigns/:id/activity — search, status filter, pagination) and
 * the unsubscribe flow that feeds it (GET/POST /t/u/:token).
 *
 * Unsubscribes are NOT seeded as bare events: they go through the real link →
 * endpoint flow, preceded by the open/click events a mail scanner (or the
 * recipient) produces first. Seeding a lone `unsubscribed` event is what let
 * the old "clicked > opened > unsubscribed" precedence pass here while every
 * real unsubscribe was hidden in production.
 *
 * Run against a dev server:   pnpm dev   then   node --env-file=.env tests/campaign-activity.e2e.mjs
 * Target another deployment:  APP=https://... node --env-file=.env tests/campaign-activity.e2e.mjs
 *
 * Seeds a throwaway campaign + contacts + sends + events with the service-role
 * key, exercises the endpoint through a real authenticated session, and cleans
 * everything up at the end.
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
    'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url')
  if (encoded.length <= MAX_CHUNK_SIZE) return `${COOKIE_NAME}=${encoded}`
  const parts = []
  for (let i = 0; i * MAX_CHUNK_SIZE < encoded.length; i++) {
    parts.push(
      `${COOKIE_NAME}.${i}=${encoded.slice(i * MAX_CHUNK_SIZE, (i + 1) * MAX_CHUNK_SIZE)}`,
    )
  }
  return parts.join('; ')
}

const TEST_EMAIL = 'contacts-add-e2e@example.com'
const TEST_PASS = 'contacts-add-e2e-pass-123!'

let Cookie = ''
async function signIn() {
  const { error: createErr } = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASS,
    email_confirm: true,
  })
  if (createErr && !/already/i.test(createErr.message)) throw createErr
  const { data, error } = await anon.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASS,
  })
  if (error) throw error
  Cookie = sessionCookieHeader(data.session)
}

async function api(path, { auth = true, method = 'GET', body } = {}) {
  const res = await fetch(`${APP}${path}`, {
    method,
    headers: {
      ...(auth ? { Cookie } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try {
    json = await res.json()
  } catch {
    /* no body */
  }
  return { status: res.status, json }
}

/** Public tracking route: no session, raw HTML back. */
async function page(path, { method = 'GET', body, contentType } = {}) {
  const res = await fetch(`${APP}${path}`, {
    method,
    redirect: 'manual',
    headers: contentType ? { 'Content-Type': contentType } : {},
    body,
  })
  return { status: res.status, html: await res.text() }
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

/* ---------- seed ----------
 * 9 recipients with distinct derived statuses:
 *   alice   → clicked      (sent + opened + clicked events)
 *   bob     → opened       (sent + opened, plus 1,100 repeat opens — see below)
 *   carol   → delivered    (sent, no events)
 *   dave    → bounced
 *   erin    → failed
 *   frank   → delivered    (second "delivered" for pagination checks)
 *   gina    → unsubscribed (opened + clicked first, then the link → confirm
 *                           page → POST, like a scanner followed by the person)
 *   hank    → unsubscribed (RFC 8058 one-click POST from the mailbox provider)
 *   ivy     → complained   (complaint on a send that was also opened)
 *
 * Bob's repeat opens push the campaign past PostgREST's 1000-row page, and the
 * unsubscribe events land after them: an endpoint that reads events with one
 * plain select drops exactly the rows these tests look for.
 */
const STAMP = 'act-e2e'
const CONTACTS = [
  { email: `${STAMP}-alice@example.com`, first_name: 'Alice', last_name: 'Clicker' },
  { email: `${STAMP}-bob@example.com`, first_name: 'Bob', last_name: 'Opener' },
  { email: `${STAMP}-carol@example.com`, first_name: 'Carol', last_name: 'Reader' },
  { email: `${STAMP}-dave@example.com`, first_name: 'Dave', last_name: 'Bouncer' },
  { email: `${STAMP}-erin@example.com`, first_name: 'Erin', last_name: 'Failer' },
  { email: `${STAMP}-frank@example.com`, first_name: 'Frank', last_name: 'Quiet' },
  { email: `${STAMP}-gina@example.com`, first_name: 'Gina', last_name: 'Leaver' },
  { email: `${STAMP}-hank@example.com`, first_name: 'Hank', last_name: 'Oneclick' },
  // The SES complaint handler flags the contact as well as the send.
  { email: `${STAMP}-ivy@example.com`, first_name: 'Ivy', last_name: 'Complainer', status: 'complained' },
]
const LIST_NAME = `${STAMP}-list`
const who = (email) => email.split('-')[2].split('@')[0]

let campaignId
let listId
const unsubToken = {}
const sendByWho = {}
const contactByWho = {}
async function cleanup() {
  if (campaignId) {
    await admin.from('campaigns').delete().eq('id', campaignId)
  } else {
    await admin.from('campaigns').delete().eq('name', `${STAMP}-campaign`)
  }
  await admin.from('lists').delete().eq('name', LIST_NAME)
  // Cascades to sends → tracking_tokens / email_events.
  await admin
    .from('contacts')
    .delete()
    .in('email', CONTACTS.map((c) => c.email))
}

async function seed() {
  const { data: camp, error: cErr } = await admin
    .from('campaigns')
    .insert({
      name: `${STAMP}-campaign`,
      subject: 'activity filter test',
      from_name: 'Test',
      from_email: 'test@example.com',
      html: '<p>x</p>',
      design: {},
      status: 'sent',
    })
    .select('id')
    .single()
  if (cErr) throw cErr
  campaignId = camp.id

  const { data: contacts, error: ctErr } = await admin
    .from('contacts')
    .insert(CONTACTS.map((c) => ({ status: 'active', ...c })))
    .select('id, email')
  if (ctErr) throw ctErr
  const idByEmail = new Map(contacts.map((c) => [c.email, c.id]))

  const sendStatus = {
    alice: 'sent',
    bob: 'sent',
    carol: 'sent',
    dave: 'bounced',
    erin: 'failed',
    frank: 'sent',
    gina: 'sent',
    hank: 'sent',
    ivy: 'complained',
  }
  const base = Date.now()
  const sendsRows = CONTACTS.map((c, i) => {
    return {
      campaign_id: campaignId,
      contact_id: idByEmail.get(c.email),
      status: sendStatus[who(c.email)],
      // distinct sent_at per row → deterministic order (alice newest)
      sent_at: new Date(base - i * 60_000).toISOString(),
    }
  })
  const { data: sends, error: sErr } = await admin
    .from('sends')
    .insert(sendsRows)
    .select('id, contact_id')
  if (sErr) throw sErr
  const sendByEmail = new Map(
    sends.map((s) => {
      const email = contacts.find((c) => c.id === s.contact_id)?.email
      return [email, s.id]
    }),
  )

  for (const c of contacts) {
    sendByWho[who(c.email)] = sendByEmail.get(c.email)
    contactByWho[who(c.email)] = c.id
  }

  const events = [
    { who: 'alice', type: 'opened' },
    { who: 'alice', type: 'clicked' },
    { who: 'bob', type: 'opened' },
    ...Array.from({ length: 1100 }, () => ({ who: 'bob', type: 'opened' })),
    // What a scanner does within seconds of delivery: open, follow every link.
    { who: 'gina', type: 'opened' },
    { who: 'gina', type: 'clicked' },
    { who: 'ivy', type: 'opened' },
  ]
  const { error: eErr } = await admin.from('email_events').insert(
    events.map((e) => ({ send_id: sendByWho[e.who], type: e.type })),
  )
  if (eErr) throw eErr

  // Unsubscribe tokens exactly as campaign-dispatch stores them.
  for (const w of ['gina', 'hank']) unsubToken[w] = `${STAMP}-unsub-${w}-${base}`
  const { error: tErr } = await admin.from('tracking_tokens').insert(
    ['gina', 'hank'].map((w) => ({
      token: unsubToken[w],
      send_id: sendByWho[w],
      type: 'unsubscribe',
    })),
  )
  if (tErr) throw tErr

  // A list holding every recipient, for the dispatch-eligibility check.
  const { data: list, error: lErr } = await admin
    .from('lists')
    .insert({ name: LIST_NAME })
    .select('id')
    .single()
  if (lErr) throw lErr
  listId = list.id
  const { error: jErr } = await admin
    .from('list_contacts')
    .insert(contacts.map((c) => ({ list_id: listId, contact_id: c.id })))
  if (jErr) throw jErr
}

async function contactStatus(w) {
  const { data } = await admin
    .from('contacts')
    .select('status')
    .eq('id', contactByWho[w])
    .single()
  return data?.status
}
async function unsubEvents(w) {
  const { count } = await admin
    .from('email_events')
    .select('id', { count: 'exact', head: true })
    .eq('send_id', sendByWho[w])
    .eq('type', 'unsubscribed')
  return count
}

/* ---------- tests ---------- */

await signIn()
await cleanup()
await seed()

console.log(`Running against ${APP} (campaign ${campaignId})\n`)

const base = `/api/campaigns/${campaignId}/activity`

try {
  console.log('unsubscribe flow (link → endpoint)')
  {
    // Visiting the link — what a mail scanner does — changes nothing.
    const get = await page(`/t/u/${unsubToken.gina}`)
    check('GET link → 200 confirmation page', get.status === 200 && /<form method="post"/.test(get.html), get.status)
    check('GET leaves contact active', (await contactStatus('gina')) === 'active')
    check('GET records no event', (await unsubEvents('gina')) === 0)

    // The confirmation page's button: form POST, no body.
    const post = await page(`/t/u/${unsubToken.gina}`, { method: 'POST' })
    check('form POST → 200 success page', post.status === 200 && /unsubscribed/i.test(post.html), post.status)
    check('POST unsubscribes contact', (await contactStatus('gina')) === 'unsubscribed')
    check('POST records one event on the send', (await unsubEvents('gina')) === 1)

    const again = await page(`/t/u/${unsubToken.gina}`, { method: 'POST' })
    check('repeat POST idempotent (still one event)', again.status === 200 && (await unsubEvents('gina')) === 1)
    const revisit = await page(`/t/u/${unsubToken.gina}`)
    check('GET after unsubscribing → success page, no form', revisit.status === 200 && !/<form/.test(revisit.html))

    // RFC 8058 one-click from the mailbox provider.
    const oneClick = await page(`/t/u/${unsubToken.hank}`, {
      method: 'POST',
      contentType: 'application/x-www-form-urlencoded',
      body: 'List-Unsubscribe=One-Click',
    })
    check('RFC 8058 one-click POST → 200', oneClick.status === 200, oneClick.status)
    check('one-click unsubscribes contact', (await contactStatus('hank')) === 'unsubscribed')
    check('one-click records one event', (await unsubEvents('hank')) === 1)

    const badGet = await page(`/t/u/${STAMP}-no-such-token`)
    check('unknown token GET → invalid page', badGet.status === 200 && /not valid/i.test(badGet.html))
    const badPost = await page(`/t/u/${STAMP}-no-such-token`, { method: 'POST' })
    check('unknown token POST → 404', badPost.status === 404, badPost.status)
  }

  console.log('auth & validation')
  {
    const unauth = await api(base, { auth: false })
    check('unauthenticated → 401', unauth.status === 401, unauth)
    const bad = await api(`${base}?status=nope`)
    check('unknown status → 400', bad.status === 400, bad)
  }

  console.log('unfiltered')
  {
    const r = await api(`${base}?limit=10`)
    check('all 9 recipients', r.json?.total === 9 && r.json?.data?.length === 9, r.json)
    const statuses = Object.fromEntries(r.json.data.map((x) => [who(x.email), x.status]))
    check(
      'derived statuses correct',
      statuses.alice === 'clicked' &&
        statuses.bob === 'opened' &&
        statuses.carol === 'delivered' &&
        statuses.dave === 'bounced' &&
        statuses.erin === 'failed' &&
        statuses.frank === 'delivered' &&
        statuses.gina === 'unsubscribed' &&
        statuses.hank === 'unsubscribed' &&
        statuses.ivy === 'complained',
      statuses,
    )
    check('newest first', r.json.data[0]?.email.includes('alice'), r.json.data[0])
  }

  console.log('search')
  {
    const byEmail = await api(`${base}?search=${STAMP}-bob`)
    check('email search → 1 row, total 1', byEmail.json?.total === 1 && byEmail.json?.data?.[0]?.email.includes('bob'), byEmail.json)
    const byName = await api(`${base}?search=Bouncer`)
    check('last-name search finds dave', byName.json?.total === 1 && byName.json?.data?.[0]?.email.includes('dave'), byName.json)
    const byFirst = await api(`${base}?search=alice`)
    check('first-name/email search finds alice', byFirst.json?.total === 1, byFirst.json)
    const none = await api(`${base}?search=zzz-no-such`)
    check('no match → empty, total 0', none.json?.total === 0 && none.json?.data?.length === 0, none.json)
  }

  console.log('status filter')
  {
    const delivered = await api(`${base}?status=delivered`)
    check('delivered → 2 (carol, frank)', delivered.json?.total === 2, delivered.json)
    const clicked = await api(`${base}?status=clicked`)
    check('clicked → alice only', clicked.json?.total === 1 && clicked.json?.data?.[0]?.email.includes('alice'), clicked.json)
    const opened = await api(`${base}?status=opened`)
    check('opened → bob only (clicked outranks)', opened.json?.total === 1 && opened.json?.data?.[0]?.email.includes('bob'), opened.json)
    const bounced = await api(`${base}?status=bounced`)
    check('bounced → dave only', bounced.json?.total === 1 && bounced.json?.data?.[0]?.email.includes('dave'), bounced.json)
    const queued = await api(`${base}?status=queued`)
    check('queued → none', queued.json?.total === 0, queued.json)
    const unsub = await api(`${base}?status=unsubscribed`)
    check(
      'unsubscribed → gina + hank (outranks opened/clicked)',
      unsub.json?.total === 2 &&
        unsub.json.data.map((x) => who(x.email)).sort().join() === 'gina,hank',
      unsub.json,
    )
    const complained = await api(`${base}?status=complained`)
    check('complained → ivy (outranks opened)', complained.json?.total === 1 && complained.json?.data?.[0]?.email.includes('ivy'), complained.json)
  }

  console.log('filter ↔ stats consistency')
  {
    const stats = await api(`/api/campaigns/${campaignId}/stats`)
    const unsub = await api(`${base}?status=unsubscribed`)
    check('stats counts.unsubscribed === 2', stats.json?.counts?.unsubscribed === 2, stats.json?.counts)
    check('Unsubscribed filter total === stats unsubscribed', unsub.json?.total === stats.json?.counts?.unsubscribed, { filter: unsub.json?.total, stats: stats.json?.counts?.unsubscribed })
    check('stats sees every event past 1000 rows (opened = 4)', stats.json?.counts?.opened === 4, stats.json?.counts)
  }

  console.log('compliance: unsubscribed contacts are not sendable')
  {
    // POST /api/segments/preview applies campaign-dispatch's eligibility filter.
    const r = await api('/api/segments/preview', { method: 'POST', body: { listId } })
    // 9 on the list − gina, hank (unsubscribed) − ivy (complained)
    check('list of 9 → 6 sendable', r.json?.total === 6, r.json)
  }

  console.log('filters + pagination consistency')
  {
    const p1 = await api(`${base}?status=delivered&limit=1&page=1`)
    const p2 = await api(`${base}?status=delivered&limit=1&page=2`)
    check('page 1/2 both sized 1, total 2', p1.json?.data?.length === 1 && p2.json?.data?.length === 1 && p1.json?.total === 2 && p2.json?.total === 2, { p1: p1.json, p2: p2.json })
    check('pages disjoint', p1.json?.data?.[0]?.sendId !== p2.json?.data?.[0]?.sendId)
    const p3 = await api(`${base}?status=delivered&limit=1&page=3`)
    check('past-the-end page → empty, same total', p3.json?.data?.length === 0 && p3.json?.total === 2, p3.json)
    const combo = await api(`${base}?search=${STAMP}&status=failed`)
    check('search+status combine → erin', combo.json?.total === 1 && combo.json?.data?.[0]?.email.includes('erin'), combo.json)
  }
} finally {
  await cleanup()
  await anon.auth.signOut()
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
