---
title: "Landing Pages, Payload Hosting & Reporting"
description: "Building clone and consent landing pages for an authorized simulation, capturing interaction safely, and turning results into a report the client can act on."
phase: Phishing
order: 2
tags:
  - landing page
  - payload
  - reporting
  - awareness
tools:
  - gophish
  - evilginx
updated: 2026-10-01
---

A runbook for hosting the landing side of an **authorized** phishing simulation and reporting its results. Goal: stand up a safe, clearly-labelled landing page on your own infrastructure, capture only what the scope permits, and produce a report the client can act on. In most engagements the goal is **measuring susceptibility**, not capturing credentials.

## 1. Choose the landing type

| Type | Purpose | When to use |
|------|---------|-------------|
| Clone (non-capturing) | awareness + click-rate | default, safest |
| Consent / education | show training message | policy-focused programs |
| Credential-capturing | prove real risk | only if explicitly authorized |

Prefer **simulated** entry fields that record only that a submission happened — never store real passwords.

## 2. Host a safe clone

Clone the visual layout, but host it on your authorized domain and strip all real scripts.

```bash
# Pull the page for visual reference only
curl -s https://target.com/login -o reference.html

# Strip scripts and forms before hosting your own static copy
sed -E '/<script/,/<\/script>/d' reference.html > landing.html
grep -c '<script' landing.html   # expect 0

# Serve it on the authorized simulation domain
python3 -m http.server 8080 --directory ./landing
```

Label the campaign clearly in logs so every hit ties back to the engagement.

## 3. Wire the landing into GoPhish

```bash
# Create the landing page from your static file
curl -sk https://127.0.0.1:3333/api/pages/ -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' -d @page.json

# Attach it to the campaign and set the redirect target
curl -sk https://127.0.0.1:3333/api/campaigns/ -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' -d @campaign.json
```

## 4. Session/token capture (high sensitivity, optional)

Only with explicit written authorization. Tools like Evilginx can capture session cookies that bypass MFA.

```bash
evilginx2 -p /etc/evilginx/phishlets
# config domain example.test
# phishlet enable o365
# lures create o365
# sessions ls
```

Scope to the test window, retain only redacted proof, and destroy captured sessions immediately after.

## 5. Monitor live and be ready to stop

```bash
# Watch GoPhish campaign results as they land
curl -sk "https://127.0.0.1:3333/api/campaigns/1/results" \
  -H "Authorization: Bearer $API_KEY" | jq '.results[] | {email, status, ip}'
```

Pause the campaign on signs of distress or unintended targets. Keep the crisis contact reachable throughout.

## 6. Purge captured data on schedule

```bash
# Prove destruction of captured interaction data
shred -u captured/*.csv
ls -la captured/   # should be empty
```

Never reuse captured credentials elsewhere.

## 7. Build the report

Structure for a non-technical audience:

1. **Executive summary** — click and report rates vs industry baseline.
2. **What worked** — which pretexts/teams were most susceptible.
3. **What defended well** — who reported the mail (celebrate them).
4. **Technical findings** — SPF/DKIM/DMARC gaps, MFA-bypass exposure.
5. **Recommendations** — training, DMARC enforcement, MFA hardening, reporting culture.

## 8. Full pipeline (one block)

```bash
curl -s https://target.com/login -o reference.html
sed -E '/<script/,/<\/script>/d' reference.html > landing.html
python3 -m http.server 8080 --directory ./landing &

curl -sk https://127.0.0.1:3333/api/pages/ -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' -d @page.json
curl -sk https://127.0.0.1:3333/api/campaigns/ -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' -d @campaign.json

curl -sk "https://127.0.0.1:3333/api/campaigns/1/results" \
  -H "Authorization: Bearer $API_KEY" | jq '.results[] | {email, status}'

shred -u captured/*.csv
```

## Ethics & legality

- No malware, no real data theft, no distress-based lures.
- Capture credentials/sessions only if explicitly authorized in writing.
- Delete captured data on schedule with proof, and never reuse it elsewhere.
