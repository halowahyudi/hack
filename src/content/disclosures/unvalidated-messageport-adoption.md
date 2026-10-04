---
title: "OPPO — Stealing a Verification Ticket via Unvalidated MessagePort Adoption"
description: "OPPO's step-up verification page on id.oppo.com could be framed by any origin and opened a MessageChannel to its parent without checking event.origin. The browser handed the authentication result to the attacker's frame instead of the legitimate one."
pubDate: 2026-09-15
recorded: 2026-09-15
program: OPPO (id.oppo.com)
severity: Medium
category: Improper Verification of Source
cwe: CWE-940
redacted: true
featured: false
tags:
  - postmessage
  - clickjacking
  - appsec
  - bug-bounty
---

> **Coordinated disclosure.** Redacted writeup. Hostnames, endpoints, script filenames, message
> constants, and captured tokens are withheld. Describes the class and impact only.

## The short version

A step-up verification page on `id.oppo.com` ran inside an iframe on OPPO's own domain. Because the
route sent no `X-Frame-Options` and no `Content-Security-Policy: frame-ancestors` — even though the
root page of the same site did — any origin could embed it. Once embedded, the page opened a
`MessageChannel` to its parent and adopted whichever port was handed back, checking only that a
message equalled a fixed string. When verification completed, the resulting ticket was delivered to
**the attacker's** port.

## Two bugs, one report

The finding was only exploitable because of a compound failure:

1. **Missing frame protection.** The policy existed in the project — the root route sent a
   `frame-ancestors` allowlist — but it was not applied to the verification route and its siblings.
   Same pattern as the OAuth introspection case: the control exists elsewhere, so its absence here is
   a regression, not a design choice.
2. **Missing origin check on the receiving side.** The outer half of the same class checked the
   sender's origin. The inner half — the one that mattered, because the attacker gets to be the
   parent — validated nothing.

The lesson that generalizes: **`postMessage` origin checks must exist on both ends.** Developers often
hardcode the check on the side they wrote first and forget the side that adopts the port.

## Why scoping the impact mattered

I pushed hard to break my own claim, and two results weakened it rather than strengthened it — which I
reported plainly:

- A "redirect judge" endpoint appeared to validate the ticket pair but accepted a deliberately fake
  ticket on the same process token, meaning it never reads the value. It was not proof.
- Completing login with the stolen pair failed unless the process token had passed an earlier
  password-bearing step, which is unreadable from a cross-origin frame. So the stolen ticket was a
  **flow continuation token, not a standalone credential.**

The honest conclusion: no session was taken and no account change was made. What stands is the control
failure — a message channel carrying an authentication token opened to any origin that echoes one
hardcoded string.

## Impact

Anyone who knows a victim's identifier can serve a single page, show the genuine provider password
screen inside it, and receive the server's verification result on a channel they control. The victim
types into a real page from the real domain, so nothing leaks in the act of typing — but the
credential comes back to the attacker instead of the legitimate caller.

## What I took away

- **Check both ends of every message channel.** An untrusted parent is a legitimate threat model.
- **Missing headers are a diff, not a vibe.** Comparing protected and unprotected routes on the same
  site produced the clearest evidence.
- **Report the limits of your own exploit.** Showing what *did not* work made the confirmed control
  failure more credible, not less.
- **Small mistakes cost real time.** A `$$` escape in a replacement string silently broke the
  handshake; instrumenting every frame was what exposed it.
