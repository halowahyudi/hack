---
title: "Responsible Disclosure: From Finding to Fix, the Full Playbook"
description: "What happens between 'you found something' and 'the fix shipped' — triage, evidence, CVEs, timelines, and how to behave like a professional when vendors get busy."
pubDate: 2026-06-03
featured: true
tags:
  - responsible disclosure
  - bug bounty
  - cve
  - appsec
---

Finding the bug is maybe 30% of the job. The other 70% is turning it into a fix — and
that's where most researchers drop the ball, or worse, create legal exposure. This is
the process I run for every disclosure.

## Phase 1 — The 24-hour rule

You found something real. **Before you touch anyone's inbox:**

- [ ] Reproduced it three times, on the target's *latest* version
- [ ] Captured clean evidence — no test accounts or personal data in the payloads
- [ ] Identified the *exact* version / commit affected
- [ ] Checked it isn't a known issue (CVE, vendor advisory, duplicate report)

## Phase 2 — Triage the target

1. **Do they have a bug bounty program?** Follow their disclosure policy *to the letter*
   — scope, format, and timeline overrides everything else.
2. **No program?** Hunt for a `security.txt`, `/security.txt`, or mandated contact
   (`security@`, PSIRT).
3. **Nothing?** Then choose the disclosure path deliberately (below) and document that
   you tried the official route first with timestamps.

## Phase 3 — Write the report

Busy engineers skim. Your report must survive a skim and still be actionable.

```text
## Summary (2 sentences)
## Impact — business risk, not CVSS math
## Steps to reproduce (copy-paste runnable)
## Proof of concept (blurred/redacted)
## Remediation suggestions
## Timeline
```

Redact credentials, customer data and internal paths. **A report with screenshots and
curl output beats a 2,000-word essay every time.**

## Phase 4 — The coordination dance

Nothing obligates a vendor to act on your timeline, but three things keep you inside the
professional lane:

- Ask for an acknowledgement deadline (usually 3–5 business days).
- Offer a **90-day coordinated disclosure deadline** from first contact — this is the
  widely accepted `CERT` norm. Extend generously when a fix is in progress.
- For critical, actively-exploited issues: use a **CNA/coordinator** (e.g. CISA,
  coordinated via CERT) rather than going public unilaterally.

## Phase 5 — CVE & credit

If a fix ships, request:

- A **CVE ID** from a CNA (the vendor, or MITRE if none).
- Credit on the advisory — which is also your public proof the report was legitimate.

Many programs offer bounties at this stage; many more pay nothing. Treat the CVE and the
credit as the actual compensation, and the money as a bonus.

## Phase 6 — When the vendor ghosts you

The professional move is *graceful escalation*, not a dump file:

1. Day 0 — full report to official channel, read receipts if possible.
2. Day +7 — polite follow-up, ask for timeline.
3. Day +30 — repeat, mention planned disclosure date.
4. Day +90 — optionally request a CNA/CISA coordinator.
5. Day +90+15 — **coordinated public disclosure**: blog post with remediation advice,
   *no exploit details*, no weaponized payload.

## The rules I never break

- Never test production systems I wasn't explicitly scoped for.
- Never exfiltrate more than the minimum proof.
- Never post exploit code before the fix is widely deployed.
- Always convert findings into regression tests / SDL gates for the vendor.

Disclosure is reputation work. Do it well and a "hostile" audit ends with the vendor
*asking you* to test their next release.