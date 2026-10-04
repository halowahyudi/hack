---
title: "Email Authentication Analysis: SPF, DKIM & DMARC"
description: "Analyzing SPF, DKIM and DMARC posture during an authorized engagement to show where spoofed mail can still land, with dig and swaks dry runs."
phase: Phishing
order: 1
tags:
  - spoofing
  - spf
  - dkim
  - dmarc
tools:
  - swaks
  - dig
  - smtp
updated: 2026-10-01
---

A runbook for **analyzing** an organization's email authentication posture during an authorized engagement. Goal: retrieve the SPF, DKIM and DMARC configuration for an in-scope domain, identify enforcement gaps, and demonstrate where a spoofed message could still be accepted — without delivering real attacks.

## 1. Retrieve SPF

```bash
dig +short TXT target.com | grep -i 'v=spf1' | tr -d '"'

# Follow the include chain recursively
dig +short TXT _spf.google.com | tr -d '"'
dig +short TXT sendgrid.net | tr -d '"'
```

Flag `+all`, `?all`, or a bare `~all` as weak; count the DNS lookups (10 max).

## 2. Retrieve DMARC policy

```bash
dig +short TXT _dmarc.target.com | tr -d '"'

# Compare subdomain policy and reporting addresses
dig +short TXT _dmarc.target.com | tr -d '"' | grep -oE '(p|sp|rua|ruf)=[^;]+'
```

`p=none` means monitor-only: reports are collected but nothing is blocked.

## 3. Retrieve DKIM selectors

Selectors are not discoverable by DNS alone — try common names and any leaked in headers.

```bash
for s in default selector1 selector2 google dkim s1 mail; do
  echo "== $s =="
  dig +short TXT "$s._domainkey.target.com" | tr -d '"'
done
```

Note key length (reject anything under 1024-bit) and whether the selector is still valid.

## 4. Check spelling/alignment posture

DMARC requires alignment between the From domain and the authenticated domain. Review `aspf`/`adkim` (`r` relaxed or `s` strict) and third-party senders.

```bash
dig +short TXT _dmarc.target.com | tr -d '"' | grep -oE 'a(dkim|spf)=[rs]'
```

## 5. Send an authorized dry run with swaks

Only to mailboxes you control or that are explicitly authorized. Inspect the received headers, not the delivery.

```bash
swaks --server smtp.example.test --from spoof@target.com \
      --to sim-inbox@example.test \
      --header-X-Test "authorized-spf-check" \
      --header "Subject: SPF/DMARC dry run" \
      --body "Analyzing header alignment only. No payload." --quit-after RCPT

# Inspect the resulting headers, if captured
grep -iE 'spf|dkim|dmarc|Received-SPF|Authentication-Results' captured.eml
```

## 6. Assess lookalike and cousin domains

Even a perfect DMARC policy does not stop a cousin domain. Test whether the org monitors for these.

```bash
for d in examp1e.com example-corp.com example.co example.net; do
  echo "== $d =="
  dig +short A "$d"
  dig +short TXT "_dmarc.$d" | tr -d '"'
done
```

## 7. Full pipeline (one block)

```bash
echo "== SPF ==";  dig +short TXT target.com | grep -i 'v=spf1' | tr -d '"'
echo "== DMARC =="; dig +short TXT _dmarc.target.com | tr -d '"'

echo "== DKIM =="
for s in default selector1 selector2 google dkim s1; do
  echo "-- $s --"; dig +short TXT "$s._domainkey.target.com" | tr -d '"'
done

echo "== Lookalikes =="
for d in examp1e.com example-corp.com example.co; do
  echo "-- $d --"; dig +short A "$d"; dig +short TXT "_dmarc.$d" | tr -d '"'
done

swaks --server smtp.example.test --from spoof@target.com \
      --to sim-inbox@example.test --header "Subject: dry run" \
      --body "header alignment analysis only" --quit-after RCPT
```

## 8. What to report

- SPF/DKIM/DMARC results as seen in the received headers.
- Whether mail reached inbox vs spam vs rejected.
- The exact From/Envelope mismatch that made it work.
- Concrete remediation: enforce `p=reject`, tighten `~all`, add lookalike monitoring.

## Ethics & legality

- Analyze and dry-run only against mailboxes you control or that are authorized in writing.
- Never spoof a domain you do not own without explicit written permission.
- Keep payloads inert; report header evidence, never deliver real attacks or malware.
