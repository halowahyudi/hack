---
title: "API Security Testing for SDETs: A Practical Checklist"
description: "How quality engineers can shift left on API security — threat-focused test cases, auth bypass checks, and automation patterns that don't burn the team's time."
pubDate: 2026-07-22
featured: true
tags:
  - api security
  - sdet
  - automation
  - owasp
---

As an SDET you already own the API test suite. That gives you a secret superpower:
**you can find security bugs in the same request you're already sending for
functional coverage** — without waiting for a pentest.

## The mindset shift

Functional tests answer *"does it work?"*. Security tests answer *"does it work when
the user is malicious?"*. The request payload is identical; only the expectations change.

The four questions I force into every API suite:

1. **Does it enforce rules I didn't ask for?** IDOR is just parametrized ID + missing check.
2. **Does it trust client input?** Client-supplied roles, prices, quantities, phone numbers.
3. **Does it leak in the response shape?** Stack traces, verbose errors, internal IDs.
4. **Does it fail closed?** Rate limits, auth failures, banned tokens.

## Test cases that map to the OWASP API Top 10

### Object-level authorization (BOLA / IDOR)

```js
// Existence: object A accessible with authenticated user B
const asBob = await api.login(bob);
const evasObj = await asBob.get('/v1/orders/' + alicesOrderId);
assert.equal(evasObj.status, 403); // 200 => BOLA
```

Run the same collection as a *different* user with a *different severity of client —
mobile, web, partner portal*.

### Broken object property-level authorization (mass assignment)

```jsonc
// Functional test payload
{ "name": "acme", "plan": "free" }

// Security payload — same endpoint, extra fields
{ "name": "acme", "plan": "free", "role": "admin", "isAdmin": true, "credit": 1000000 }
```

Assert the object's fields are exactly what the API declared — nothing extra was persisted.

### Excessive data exposure

Response assertions shouldn't only check `status`. Assert on the **shape**:

```js
assert.deepEqual(Object.keys(body), ['id', 'name', 'status']); // scan body for PII
```

### Rate limiting & brute force

```js
for (let i = 0; i < 101; i++) {
  const res = await api.post('/auth/login', credentials);
  await waitMs(50);
}
// expect 429 after threshold, and a lockout/backoff, not 200 forever
```

Failure mode to flag: **auth failures are slow but successful — a welcome mat for
credential stuffing.**

### Broken function-level authorization

Take a collection folder of admin endpoints and replay it with an authenticated *user*
token. 403 expected everywhere except the documented exceptions.

## Cheat to find them faster

- **`Authorization` header:** flip between `user`, `admin`, and a *soft-deleted* account.
- **HTTP method semantics:** `GET /users/1` vs `POST /users/1` vs `PUT /users/1` — method
  confusion opens business-logic bugs.
- **ID formats:** IDs in UUID survive validation, **numeric sequential IDs invite BOLA**.
- **Verbose success:** `201` with `newResource` payload vs `204` — report both.

## Pipelines: make it run every night

```yaml
scheduled-task:
  cron: "0 2 * * *"
  steps:
    - checkout
    - npm ci
    - run: npx playwright test security/ --grep "@security"
    - run: npm run security-report
```

Keep the security suite ~15–20% of the total suite. It runs on cron, not on every PR —
 findings are slow-moving enough that nightly is the right cadence.

## What to do with a hit

1. Reproduce against the *latest* staging build — timestamps matter.
2. Confirm it's not a test artifact (own token, own tenant).
3. Write it as a **regression test first**, then file the ticket with evidence.
4. Never report a "bug" you haven't seen fail in a clean environment.

The SDET layer isn't a replacement for a real pentest — it's the *prefilter* that makes
the pentester's day count. Start with ten of these test cases; add one per sprint, and
you'll have a genuine security regression suite within the quarter.