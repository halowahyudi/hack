---
title: "Kaltura — Email Verification Bypass in Self-Serve Signup"
description: "Kaltura's self-serve signup issued live, authenticated partner accounts without ever verifying the email — an unvalidated CAPTCHA, a verification secret returned in the API response, and a login path that never checked verification status at all."
pubDate: 2026-09-20
recorded: 2026-09-20
program: Kaltura (mediaspace.kaltura.com)
severity: High
category: Improper Authentication
cwe: CWE-287
redacted: true
featured: true
tags:
  - authentication-bypass
  - business-logic
  - bug-bounty
  - api-security
---

> **Coordinated disclosure.** Redacted writeup. Endpoint paths, tenant identifiers, tokens, and test
> accounts are withheld. Describes the vulnerability class and impact only.

## The short version

A self-serve signup flow provisioned fully-active tenant accounts — including a live product subdomain
— without the email address ever being verified. Three separate failures stacked into one chain:

1. The CAPTCHA token submitted at signup was **never validated server-side**, and no rate limiting was
   observed, so signup was scriptable with arbitrary email strings.
2. The email-verification secret was **returned directly in the registration API response**, not just
   emailed, so it could be replayed immediately without ever opening an inbox.
3. As a control test, an account whose verification step was **skipped entirely** could still
   authenticate against the management API. Verification was not enforced as a login precondition.

## The chain is the finding

Any one of these is worth reporting; together they remove the entire gate between an anonymous web
request and a live, authenticated presence inside the product. The key discipline was the **control
test**: rather than assuming the leaked verification secret was the only path, I created a second
account and never performed verification at all. It logged in anyway. That result upgraded the report
from "secret leak" to "verification is not enforced anywhere in the stack," which is the more serious
and more useful framing.

## Proving non-deliverability

All test accounts used domains I did not own. To show no inbox could ever have received a
verification email, I resolved each signup domain via DNS-over-HTTPS and confirmed `NXDOMAIN` with no
MX record. This matters: it demonstrates the flow never depended on a reachable mailbox in the first
place, rather than relying on "I didn't check my email."

## Impact

- **Unlimited account provisioning** with arbitrary, unowned addresses, at zero cost.
- **Free-tier resource abuse at scale** — each account provisions its own live subdomain with storage
  and processing quota.
- **Tenant and billing pollution** — fabricated rows in partner and subscription tables skew trial and
  conversion metrics and make abuse hard to distinguish from real customers.
- **Account enumeration** — a flag on the first request leaked whether an email was already a customer.
- **Bounded credentials.** The minted session was scoped to the attacker's own tenant; cross-tenant
  calls were denied. Framing impact honestly here — "unlimited provisioning," not "data breach" — is
  what makes the report credible.

## What I took away

- **Always run the control test.** Skip the step you assume is required and see if the system still
  lets you through. The absence of enforcement is often bigger than the bug you set out to find.
- **Server-side validation must actually validate.** A CAPTCHA token that is accepted without
  verification is decoration.
- **Never return a verification secret in an API response.** It turns "click the link in your inbox"
  into "read the field in the response."
- **Prove your own premises.** DNS-over-HTTPS confirmed the domains could not receive mail, closing the
  obvious reviewer objection before it was raised.
- **Tag your traffic.** Marking every request with a program header makes triage and log correlation
  trivial and signals good faith.
