---
title: "IDOR & Broken Access Control"
description: "Horizontal and vertical privilege issues: finding object references, testing function-level access, and proving authorization gaps without touching other users' data."
phase: Web
order: 0
tags:
  - idor
  - access control
  - authorization
  - owasp
tools:
  - burp suite
  - autorize
  - ffuf
updated: 2026-10-01
---

A runbook for authorized testing of broken access control on **in-scope** targets. Goal: find object references the app trusts blindly, prove a boundary is crossed using two accounts you own, and stop there.

## 1. Map every object reference

Browse with a proxy on and catalogue every identifier the app sends or returns.

```bash
# Export all unique IDs/params seen in Burp after a crawl
# (Proxy -> HTTP history -> save items), then diff structure
grep -rhoE '(id|uid|account|invoice|order|doc)[a-z_]*=[^& ]+' history.txt | sort -u
```

Watch for numeric IDs, UUIDs, slugs, emails, and IDs hidden in JSON bodies, GraphQL variables, and headers. Do not assume a UUID is safe — just harder to guess.

## 2. Set up two owned accounts

Access bugs need a baseline. Register **two accounts you control** (`userA`, `userB`) and keep both sessions in Burp.

- `userA` = the attacker context (viewer/low role).
- `userB` = the victim object owner (second role).

Never use a real user's identifier.

## 3. Swap sessions, not just IDs

Replay `userA`'s request with `userB`'s token and vice versa. A 200 is not proof; compare bodies field by field.

```bash
# Replay with the other account's cookie and compare responses
curl -s https://target/api/user/1042 -H "Cookie: session=USERA" -o a.json
curl -s https://target/api/user/1042 -H "Cookie: session=USERB" -o b.json
diff <(jq -S . a.json) <(jq -S . b.json)
```

## 4. Swap identifiers systematically

Fuzz the object reference with the low-privilege token to find which values the app leaks.

```bash
# Numeric IDs around your own, using userA's cookie
seq 1000 1100 | ffuf -u "https://target/api/user/FUZZ" \
  -H "Cookie: session=USERA" -mc 200 -fs 0 -w - -s
```

Also test method confusion (`GET` vs `PUT`/`DELETE`), older API versions (`/v1` vs `/v2`), and path tricks (`/api/v1/../v1/admin`).

## 5. Automate the auth swap with Autorize

Load Autorize in Burp, set `userB`'s cookie as the low-privilege session, then browse as `userA`. It replays every request with the swapped cookie and flags likely bypasses. Manually confirm each flag — false positives are common.

## 6. Prove impact safely

- Demonstrate access only to **your own second account's** object.
- For write/delete impact, act on a record you created.
- Redact personal data in screenshots; keep just enough to prove the boundary was crossed.

## Full pipeline

```bash
# 1. Collect references while proxied
grep -rhoE '(id|uid|account|invoice|order|doc)[a-z_]*=[^& ]+' history.txt | sort -u > refs.txt

# 2. Baseline: fetch your own object with each account
curl -s https://target/api/user/1042 -H "Cookie: session=USERA" -o a.json
curl -s https://target/api/user/1042 -H "Cookie: session=USERB" -o b.json
diff <(jq -S . a.json) <(jq -S . b.json)

# 3. Enumerate with the low-privilege cookie
seq 1000 1100 | ffuf -u "https://target/api/user/FUZZ" \
  -H "Cookie: session=USERA" -mc 200 -fs 0 -w - -s

# 4. Then confirm the flags Autorize raises by hand
```

## Ethics & legality

- Only test accounts and objects you own or are explicitly authorized to access.
- Never read, modify, or delete another real user's data — prove the gap with your own records.
- Store request/response pairs as evidence and redact personal data in the report.
