---
title: "NBA — Client-Controlled Subscription Identity Fields on a Profile Update Endpoint"
description: "An identity endpoint on NBA's consumer platform accepted writes to payment and subscription linkage identifiers that should never be client-controlled. A case study in incomplete allowlists and why one validated field is the loudest signal in the response."
pubDate: 2026-09-12
recorded: 2026-09-12
program: NBA (identity.nba.com)
severity: Medium
category: Mass Assignment
cwe: CWE-915
redacted: true
featured: true
tags:
  - mass-assignment
  - access-control
  - bug-bounty
  - api-security
---

> **Coordinated disclosure.** This writeup is intentionally redacted. It describes the vulnerability
> class, the reasoning, and the impact — not the target, endpoint paths, field names, or request
> payloads. No reproduction steps are published.

## The short version

A self-serve profile update endpoint allowed an authenticated user to write arbitrary values into a
group of identity-linkage fields tied to billing and subscription systems. The same endpoint already
enforced protection on the fields that obviously mattered — so this was not a "no validation
anywhere" situation, it was a group of fields that fell outside an incomplete allowlist.

## Why this class keeps showing up

Profile and account endpoints tend to grow organically. A team adds a field for a new payment
provider, a new analytics identifier, or a new partner integration, and it gets persisted the same
way as `displayName`. The dangerous pattern is **client-controlled identity**, where a value that
downstream systems trust as authoritative can be supplied by the user's own request.

The correct mental model is an **allowlist**: only fields explicitly intended for self-service editing
should be writable, and everything else should be rejected — not silently dropped, and certainly not
persisted. A blocklist ("protect these five fields") fails the moment a sixth field is added.

## The loudest signal: one field was validated

The strongest evidence that these fields were *read* somewhere downstream was that one of them had
dedicated **type validation**. Sending a boolean persisted; sending a string was rejected with a
field-specific error. Nobody writes a targeted validation rule for a field that is never consumed.

That single detail reframes the finding. A field that is validated is a field that is trusted, and a
field that is trusted but client-writable is a data-integrity problem with a plausible path to an
entitlement problem.

## Impact

The confirmed impact is data integrity: a user can overwrite their own subscription and billing
linkage identifiers with arbitrary values, and the change persists. The plausible — but unproven —
impact is entitlement confusion if any server-side check resolves a subscription by trusting one of
those values. Proving that would require a second account holding a real subscription, which is
exactly the kind of cross-account test that needs explicit authorization before anyone attempts it.

## What I took away

- **Protect fields by allowlist, never by blocklist.** Enumerate what a user may edit; reject the rest.
- **Validate types on both read and write**, and treat a field-specific validation error as a hint
  that the field is load-bearing.
- **Distinguish "confirmed" from "plausible" in the report.** Overclaiming destroys credibility; the
  validated-field observation is what made the plausible risk worth reading.
- **Cross-account impact testing is a separate authorization.** Report the integrity issue, describe
  the theoretical path, and offer to verify it in a sandbox.
