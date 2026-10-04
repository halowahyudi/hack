---
title: "Vercel — OAuth Token Introspection Without Caller Authentication"
description: "Vercel's OAuth 2.0 introspection endpoint returned full token claims to any caller, with no client authentication and no rate limiting. The sibling revocation endpoint enforced credentials — which is what turned this from a design choice into a wiring gap."
pubDate: 2026-09-28
recorded: 2026-09-28
program: Vercel (api.vercel.com)
severity: Medium
category: Broken Authentication
cwe: CWE-306
redacted: true
featured: true
tags:
  - oauth
  - broken-authentication
  - api-security
  - bug-bounty
---

> **Coordinated disclosure.** Redacted writeup. The endpoint path, token prefixes, client
> identifiers, and all captured values are withheld. This is an analysis of the vulnerability class
> and its impact, not a reproduction guide.

## The short version

Vercel's OAuth 2.0 token introspection endpoint returned the complete claim set of a valid token —
including refresh tokens — to **any caller**, regardless of client credentials. Supplying no
credentials, deliberately wrong credentials, or correct credentials all produced identical responses.
The endpoint was publicly advertised in Vercel's OpenID discovery document.

## Why the missing auth is the whole finding

RFC 7662 §2.1 is explicit: the introspection endpoint *must* require authorization to prevent token
scanning. But the more compelling evidence here was internal to the target. The **revocation**
endpoint — sitting on the same server, operating on the same token family — *did* enforce client
authentication and rejected bad credentials cleanly.

That asymmetry is what separates a vulnerability report from a hardening suggestion. The client-auth
machinery already existed and was already wired into a sibling route; the introspection route simply
did not invoke it. "The code to fix this is one helper call away" is a far more actionable finding
than "you should consider adding authentication."

## The part that actually matters: a silent validation oracle

With a token in hand, an attacker normally has to *use* a refresh token to learn whether it is still
alive — and using it rotates it, which the legitimate client eventually notices. Introspection breaks
that. It lets someone validate a stolen refresh token **without redeeming it**: no rotation, no
invalidation, no signal to the victim.

On its own that is a modest issue — token entropy defeats enumeration, and an attacker still needs a
token to begin with. But combine **zero authentication**, **zero rate limiting**, and a **full claims
response** and the endpoint becomes a ready-made bulk token checker: sort a leaked dump into live and
dead, and return a pre-inventoried dataset (subject, issuing app, session, exact expiry) for the
survivors. The endpoint does not create the leak; it industrializes the aftermath.

## Scope discipline

- **Not a data breach.** No PII beyond an opaque subject ID, no cross-user access.
- **Not account takeover.** The token must already be compromised.
- **Not enumerable.** High-entropy tokens return `inactive` for garbage values.

Being explicit about these limits is what keeps the severity honest — and reviewers notice.

## The fix

Require the same client authentication the revocation endpoint already uses, and return a bare
`inactive` response to callers that do not own the token. Small change; the validation code already
exists next door.

## What I took away

- **Compare sibling endpoints.** A control that exists on one route but not another is the clearest
  possible argument that its absence is a bug, not a trade-off.
- **A missing control is not automatically a critical.** Severity depends on what the control was
  protecting and who can reach it. Say so plainly.
- **Rate-limit the things that reveal state.** An unauthenticated, unthrottled oracle that answers
  "is this credential live?" is a gift to anyone holding a dump.
- **Quote the spec, then prove it locally.** The RFC establishes the rule; the sibling endpoint proves
  the codebase already agrees with it.
