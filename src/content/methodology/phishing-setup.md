---
title: "Phishing Engagement Setup & Pretexting"
description: "Standing up an authorized phishing simulation: scoping, rules of engagement, target selection, pretext design and the GoPhish/Evilginx configuration that follows."
phase: Phishing
order: 0
tags:
  - phishing
  - social engineering
  - red team
  - pretext
tools:
  - gophish
  - evilginx
updated: 2026-10-01
---

A runbook for standing up an **authorized** phishing simulation. Goal: turn a signed scope into a working campaign — a clean target list, an approved pretext, and configured sending and landing infrastructure. Nothing here is delivered without explicit written permission.

## 1. Lock down authorization first

Confirm in writing before touching any infrastructure:

- Explicit scope that **covers phishing** — many contracts forbid it by default.
- Target list plus **excluded individuals** (executives, legal, HR, clients).
- Time window, crisis contact, and who may pause the campaign.
- Credential handling: storage, retention, destruction, and whether capture is allowed at all.

## 2. Build the target list from approved OSINT

```bash
# Org email format from public sources — verify against a mailbox you own
grep -rhoE '[a-z0-9._%+-]+@target\.com' leaked-public.txt | sort -u > emails.txt

# Normalize candidate formats for the org chart
printf '%s\n' 'first.last' 'flast' 'firstl' 'first_last' > patterns.txt
wc -l emails.txt
```

Prioritize finance/AP (invoice lure), IT/helpdesk (reset lure), developers (repo lure), executives (whaling).

## 3. Draft and review the pretext

A good pretext is relevant, expected, and low-friction.

| Pretext | Hook | Why it works |
|---------|------|--------------|
| Invoice / payment | finance | time pressure, routine task |
| Password expiry | all staff | urgency + authority |
| HR policy / benefits | all staff | curiosity, relevance |
| IT support callback | helpdesk | trust in internal authority |
| Shared document | collaborators | familiarity, low suspicion |

Avoid fear-based threats and anything that could cause real distress.

## 4. Configure sending infrastructure

Use a dedicated, clearly-labelled domain approved in scope. Configure authentication before launch.

```bash
# Confirm your own sending domain authenticates correctly
dig +short TXT sending.example.test
dig +short TXT _dmarc.sending.example.test
dig +short TXT selector._domainkey.sending.example.test

# Sanity-check the SMTP path without delivering to a real target
swaks --server smtp.example.test --from sim@example.test \
      --to you@example.test --header "Subject: config test" --body "dry run"
```

## 5. Stand up GoPhish and import the target set

```bash
# Launch the console (config file already present)
gophish --config config.json &

curl -sk https://127.0.0.1:3333/api/groups/ -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d @group.json

curl -sk https://127.0.0.1:3333/api/templates/ -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' -d @template.json

curl -sk https://127.0.0.1:3333/api/campaigns/ -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' -d @campaign.json
```

## 6. Stage Evilginx for the authorized MFA-bypass test (optional)

Only when the scope explicitly permits session capture.

```bash
evilginx2 -p /etc/evilginx/phishlets
# console commands
# config domain example.test
# phishlet enable o365
# lures create o365
# lures get-url 0
```

## 7. Define success metrics up front

Track delivery, open, click, **data submission**, and **reporting rate** — the reporting rate is the most important defensive metric.

## 8. Full pipeline (one block)

```bash
grep -rhoE '[a-z0-9._%+-]+@target\.com' leaked-public.txt | sort -u > emails.txt

dig +short TXT sending.example.test
dig +short TXT _dmarc.sending.example.test

gophish --config config.json &

curl -sk https://127.0.0.1:3333/api/groups/ -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' -d @group.json
curl -sk https://127.0.0.1:3333/api/templates/ -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' -d @template.json
curl -sk https://127.0.0.1:3333/api/campaigns/ -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' -d @campaign.json
```

## Ethics & legality

- Never launch without written authorization that explicitly permits phishing.
- Restrict targets to the approved list; never include excluded individuals.
- Pre-review the pretext for distress risk and keep the crisis contact reachable.
