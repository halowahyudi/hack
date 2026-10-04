---
title: "API Recon & Attack Surface"
description: "Authorized API discovery runbook: mine JS and history for endpoints, map REST versioning, test GraphQL introspection, and assemble a testable endpoint inventory."
phase: API
order: 0
tags:
  - api
  - rest
  - graphql
  - discovery
tools:
  - burp suite
  - katana
  - postman
updated: 2026-10-01
---

APIs expose the same logic as the UI with far less filtering, making them the most rewarding surface in modern apps. Goal: discover every reachable API endpoint on authorized targets and produce an inventory with method, auth, and parameters for the authorization phase.

## 1. Find the API base

```bash
# Crawl the app, keeping API-ish routes
katana -u https://target -d 4 -jc -o crawl.txt
grep -E '(/api|/v[0-9]|/rest|/graphql|/internal)' crawl.txt | sort -u > api-paths.txt

# Pull endpoint strings straight out of JS bundles
grep -ohE '"/(api|v[0-9]|rest|graphql)[^"]*"' crawl.txt | tr -d '"' | sort -u >> api-paths.txt
sort -u api-paths.txt -o api-paths.txt
```

Common bases: `/api`, `/v1`, `/v2`, `/graphql`, `/rest`, `/internal`. Compare mobile app traffic — it often hits endpoints the web app hides.

## 2. Mine history and source maps

```bash
# Historical URLs
gau target.com | grep -E '(/api/|\.json|\.xml)' | sort -u > history.txt

# Source maps reveal original routes and internal function names
curl -s https://target/static/app.js.map -o app.js.map
jq -r '.sources[]?' app.js.map | sort -u
```

## 3. Probe docs and version gaps

```bash
# Swagger / OpenAPI / docs endpoints
for p in /swagger /swagger.json /openapi.json /api-docs /redoc /graphiql /v1 /v2; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "https://target$p")
  echo "$code https://target$p"
done
```

When a spec exists, it hands you the full contract — and often parameters the UI never uses. Always compare old vs new versions; older versions frequently lack newer auth checks.

## 4. GraphQL introspection

```bash
# Introspection (if enabled)
curl -s -X POST https://target/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ __schema { types { name fields { name } } } }"}' \
  | jq -r '.data.__schema.types[] | select(.name | startswith("__") | not) | .name' | sort -u

# Probe field suggestions when introspection is disabled
curl -s -X POST https://target/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ usr }"}' | jq .errors
```

Also test batching, alias overloading, deeply nested queries, and mutations missing authorization.

## 5. Build the inventory

```bash
# Normalize the discovered paths for the next phase
sort -u api-paths.txt history.txt | grep -E '^https?://' > endpoints.txt
wc -l endpoints.txt
```

For each endpoint record: method, path (`/api/v2/users/{id}`), auth type (bearer/cookie/none), Content-Type, and parameters. Save as `endpoints.txt` and `params.txt` for the authorization pass.

## 6. Full pipeline

```bash
mkdir -p apirecon && cd apirecon

katana -u https://target -d 4 -jc -o crawl.txt
grep -E '(/api|/v[0-9]|/rest|/graphql|/internal)' crawl.txt | sort -u > api-paths.txt
grep -ohE '"/(api|v[0-9]|rest|graphql)[^"]*"' crawl.txt | tr -d '"' | sort -u >> api-paths.txt
sort -u api-paths.txt -o api-paths.txt

gau target.com | grep -E '(/api/|\.json|\.xml)' | sort -u > history.txt
curl -s https://target/static/app.js.map -o app.js.map
jq -r '.sources[]?' app.js.map | sort -u

for p in /swagger /swagger.json /openapi.json /api-docs /redoc /graphiql /v1 /v2; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "https://target$p"); echo "$code https://target$p"
done

curl -s -X POST https://target/graphql -H 'Content-Type: application/json' \
  -d '{"query":"{ __schema { types { name fields { name } } } }"}' | jq -r '.data.__schema.types[].name' | sort -u

sort -u api-paths.txt history.txt | grep -E '^https?://' > endpoints.txt
wc -l endpoints.txt
```

## Ethics & legality

- Query only APIs inside an official scope or with written authorization.
- Respect rate limits and avoid high-volume introspection or batching abuse.
- Do not access other users' data during reconnaissance.
- Log every command and endpoint so the inventory is reproducible.
