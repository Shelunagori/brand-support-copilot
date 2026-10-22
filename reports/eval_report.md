# Eval report — exp3: Llama-3.2-3B, active docs only

Generated 2026-10-22T14:19:14.989897+00:00 · 40 held-out questions · same prompt for every model, no retrieval.

| Metric | base (`meta-llama/Llama-3.2-3B-Instruct`) | aligned (`model_01m5hz9nr9gr5wqv`) | Δ aligned − base |
|---|---|---|---|
| Factual accuracy | 30.0% | 12.5% | -17.5 pp |
| Policy violations (lower is better) | 2.5% | 2.5% | +0.0 pp |
| Escalation correctness (with guardrails) | 92.5% | 72.5% | -20.0 pp |
| Escalation correctness (model only) | 92.5% | 80.0% | -12.5 pp |
| JSON valid on first try | 100.0% | 57.5% | -42.5 pp |
| JSON valid after repair | 100.0% | 57.5% | -42.5 pp |
| Correct policy_ref | 47.5% | 40.0% | -7.5 pp |
| Latency p50 (ms) | 9,177 | 18,244 | +9,067 |
| Latency p95 (ms) | 17,295 | 31,184 | +13,889 |
| Total tokens | 21,030 | 31,378 | +10,348 |
| Est. cost (USD) | $0.7991 | $1.1924 | +0.3932 |

## Accuracy by category

| Category | n | base | aligned |
|---|---|---|---|
| cancellation | 2 | 0/2 | 0/2 |
| damaged | 2 | 0/2 | 0/2 |
| delivery | 2 | 0/2 | 0/2 |
| escalation | 6 | 6/6 | 1/6 |
| exchange | 2 | 1/2 | 1/2 |
| gst | 2 | 0/2 | 0/2 |
| hinglish | 6 | 1/6 | 1/6 |
| marketplace | 3 | 2/3 | 0/3 |
| non_returnable | 2 | 0/2 | 0/2 |
| out_of_scope | 1 | 1/1 | 0/1 |
| refunds | 1 | 0/1 | 0/1 |
| returns | 2 | 1/2 | 1/2 |
| shipping | 2 | 0/2 | 0/2 |
| superseded_trap | 5 | 0/5 | 0/5 |
| warranty | 2 | 0/2 | 1/2 |

## Per question

| id | category | base correct / esc ok | aligned correct / esc ok |
|---|---|---|---|
| q01 | returns | ✅ / ✅ | ✅ / ✅ |
| q02 | returns | ❌ / ✅ | ❌ / ✅ |
| q03 | exchange | ❌ / ✅ | ❌ / ✅ |
| q04 | exchange | ✅ / ✅ | ✅ / ✅ |
| q05 | non_returnable | ❌ / ✅ | ❌ / ✅ |
| q06 | non_returnable | ❌ / ✅ | ❌ / ✅ |
| q07 | refunds | ❌ / ✅ | ❌ / ✅ |
| q08 | shipping | ❌ / ✅ | ❌ / ❌ |
| q09 | shipping | ❌ / ✅ | ❌ / ✅ |
| q10 | delivery | ❌ / ✅ | ❌ / ✅ |
| q11 | delivery | ❌ / ✅ | ❌ / ✅ |
| q12 | warranty | ❌ / ✅ | ❌ / ✅ |
| q13 | warranty | ❌ / ✅ | ✅ / ✅ |
| q14 | marketplace | ✅ / ✅ | ❌ / ❌ |
| q15 | marketplace | ✅ / ✅ | ❌ / ❌ |
| q16 | marketplace | ❌ / ✅ | ❌ / ✅ |
| q17 | damaged | ❌ / ✅ | ❌ / ✅ |
| q18 | damaged | ❌ / ✅ | ❌ / ✅ |
| q19 | gst | ❌ / ✅ | ❌ / ❌ |
| q20 | gst | ❌ / ✅ | ❌ / ❌ |
| q21 | cancellation | ❌ / ✅ | ❌ / ❌ |
| q22 | cancellation | ❌ / ✅ | ❌ / ❌ |
| q23 | escalation | ✅ / ✅ | ❌ / ✅ |
| q24 | escalation | ✅ / ✅ | ❌ / ✅ |
| q25 | escalation | ✅ / ✅ | ✅ / ✅ |
| q26 | escalation | ✅ / ✅ | ❌ / ✅ |
| q27 | escalation | ✅ / ❌ | ❌ / ✅ |
| q28 | escalation | ✅ / ✅ | ❌ / ✅ |
| q29 | superseded_trap | ❌ / ✅ | ❌ / ✅ |
| q30 | superseded_trap | ❌ / ✅ | ❌ / ❌ |
| q31 | superseded_trap | ❌ / ✅ | ❌ / ❌ |
| q32 | superseded_trap | ❌ / ✅ | ❌ / ✅ |
| q33 | superseded_trap | ❌ / ✅ | ❌ / ✅ |
| q34 | hinglish | ❌ / ✅ | ✅ / ✅ |
| q35 | hinglish | ❌ / ❌ | ❌ / ❌ |
| q36 | hinglish | ❌ / ✅ | ❌ / ✅ |
| q37 | hinglish | ❌ / ✅ | ❌ / ❌ |
| q38 | hinglish | ❌ / ✅ | ❌ / ✅ |
| q39 | hinglish | ✅ / ✅ | ❌ / ✅ |
| q40 | out_of_scope | ✅ / ❌ | ❌ / ✅ |

## Sample answers (first 8)

**q01** — My linen shirt was delivered 5 days ago. I haven't worn it and the tags are still on. Can I return it?
- *base*: Yes, you can return the item within 7 days of delivery. Please contact our customer support team to initiate the return process.  
- *aligned*: Yes, within 7 days of delivery, you can initiate a return. Please go to urbanethreads.in/myorders and follow the return process.  

**q02** — My denim jacket was delivered 10 days ago and I want to return it for a refund. Is that possible?
- *base*: Please contact our customer service team within 7 days of delivery to initiate the return process. Since it's been 10 days, we may not be able to process a return. Please contact us at [support@urbanethreads.in](mailto:support@urbanethreads.in) for assistance.  
  missed=['15 days'] violations=[]
- *aligned*: Returns are accepted within 7 days of delivery. If it has been 7 days, please contact our customer support team and they will guide you on the next steps.  
  missed=['15 days'] violations=[]

**q03** — Can I exchange my chinos for a bigger size? They were delivered 12 days ago, unworn with tags.
- *base*: We accept exchanges within 7 days of delivery. Since it's been 12 days, we can't process an exchange for a different size. However, you can initiate a return and receive a refund or store credit.  
  missed=['15 days'] violations=[]
- *aligned*: Exchanges are only accepted within 7 days of delivery. Since 12 days have passed, we cannot process an exchange. You can initiate a return and receive store credit or a refund.  
  missed=['15 days'] violations=[]

**q04** — I bought a dress marked Final Sale and it's too small. Can I exchange it for one size up?
- *base*: Since the dress is marked Final Sale, we do not offer exchanges. However, you can initiate a return and receive a store credit for the full amount, which can be used towards any other item on our website.  
- *aligned*: Final Sale items cannot be exchanged. Returns are only allowed within 7 days of delivery. If the item is damaged or not as described, please contact us for a refund.  

**q05** — I ordered a 3-pack of socks and it's still sealed. Can I return it? It was delivered 2 days ago.
- *base*: Since the product is still sealed, we can't process a return. Please contact our customer support to discuss possible alternatives or store credit.  
  missed=['socks'] violations=[]
- *aligned*: No, all items must be unworn and unwashed within 7 days of delivery. Returns are only accepted within 7 days of delivery. UT-RET-001  
  missed=['socks'] violations=[]

**q06** — The boxer briefs I bought are too tight. Can I exchange them for size L?
- *base*: We accept exchanges within 3 days of delivery. Please contact our customer support team to initiate the exchange process and we will provide a return shipping label for the original item. For size L, please note that it may not be available in stock at the time of exchange.  
  missed=['innerwear'] violations=[]
- *aligned*: Exchanges are only allowed within 7 days of delivery. Please initiate the exchange within the timeframe and select size L in the exchange form on urbanethreads.in.  
  missed=['innerwear'] violations=[]

**q07** — I paid by credit card and my returned item passed QC yesterday. When will I get my refund and where?
- *base*: Once we receive the returned item, we will process your refund within 7-10 business days. The refund will be credited to your original payment method. Please ensure the returned item is in its original condition with tags intact.  
  missed=['5-7 business days'] violations=[]
- *aligned*: Refunds are processed within 7-10 business days after QC is passed. The refund amount will be credited back to your original payment method. Please check your bank account within 7-10 business days.  
  missed=['5-7 business days'] violations=[]

**q08** — My cart total is exactly ₹999 after the coupon. Do I get free shipping?
- *base*: No, free shipping is applicable on orders above ₹1,000. For orders below ₹1,000, you will need to pay the shipping charges.  
  missed=['₹79'] violations=[]
- *aligned*: Thanks for reaching out. I want to make sure you get the right answer, so I'm connecting you with a member of our support team who will follow up shortly.  
  missed=['₹79', 'above ₹999|more than ₹999|over ₹999|₹1,000'] violations=[]

## Scoring

- **Factual accuracy**: every expected fact (and one option of each `expected_any` group) appears in the answer, no forbidden fact appears, and no fallback.
- **Policy violation**: the answer contains a forbidden fact (superseded rule, refund promise on a marketplace order, made-up exception).
- **Escalation correctness**: `escalate_to_human` equals the expected flag; reported with and without the deterministic guardrails.
- **JSON validity**: first model output parses into the strict schema; "after repair" counts the one repair retry.
- Latency is end to end through the service (Nugen call + parsing), cache off.

Total estimated Nugen spend so far: $39.1415.
