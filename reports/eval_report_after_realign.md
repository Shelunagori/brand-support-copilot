# Eval report — after re-alignment

Generated 2026-10-22T13:43:49.256209+00:00 · 40 held-out questions · same prompt for every model, no retrieval.

| Metric | base (`Qwen/Qwen2.5-0.5B-Instruct`) | aligned (`model_01m5hwkzsc790kf4`) | Δ aligned − base |
|---|---|---|---|
| Factual accuracy | 25.0% | 22.5% | -2.5 pp |
| Policy violations (lower is better) | 5.0% | 12.5% | +7.5 pp |
| Escalation correctness (with guardrails) | 87.5% | 92.5% | +5.0 pp |
| Escalation correctness (model only) | 80.0% | 85.0% | +5.0 pp |
| JSON valid on first try | 100.0% | 92.5% | -7.5 pp |
| JSON valid after repair | 100.0% | 92.5% | -7.5 pp |
| Correct policy_ref | 30.0% | 12.5% | -17.5 pp |
| Latency p50 (ms) | 29,539 | 22,974 | -6,565 |
| Latency p95 (ms) | 210,937 | 186,602 | -24,336 |
| Total tokens | 20,833 | 24,562 | +3,729 |
| Est. cost (USD) | $0.0042 | $0.0049 | +0.0007 |

## Accuracy by category

| Category | n | base | aligned |
|---|---|---|---|
| cancellation | 2 | 0/2 | 1/2 |
| damaged | 2 | 0/2 | 0/2 |
| delivery | 2 | 0/2 | 0/2 |
| escalation | 6 | 6/6 | 4/6 |
| exchange | 2 | 1/2 | 0/2 |
| gst | 2 | 0/2 | 1/2 |
| hinglish | 6 | 1/6 | 1/6 |
| marketplace | 3 | 1/3 | 1/3 |
| non_returnable | 2 | 1/2 | 0/2 |
| out_of_scope | 1 | 0/1 | 1/1 |
| refunds | 1 | 0/1 | 0/1 |
| returns | 2 | 0/2 | 0/2 |
| shipping | 2 | 0/2 | 0/2 |
| superseded_trap | 5 | 0/5 | 0/5 |
| warranty | 2 | 0/2 | 0/2 |

## Per question

| id | category | base correct / esc ok | aligned correct / esc ok |
|---|---|---|---|
| q01 | returns | ❌ / ✅ | ❌ / ✅ |
| q02 | returns | ❌ / ✅ | ❌ / ✅ |
| q03 | exchange | ❌ / ✅ | ❌ / ✅ |
| q04 | exchange | ✅ / ✅ | ❌ / ✅ |
| q05 | non_returnable | ✅ / ✅ | ❌ / ✅ |
| q06 | non_returnable | ❌ / ✅ | ❌ / ✅ |
| q07 | refunds | ❌ / ✅ | ❌ / ✅ |
| q08 | shipping | ❌ / ✅ | ❌ / ✅ |
| q09 | shipping | ❌ / ✅ | ❌ / ✅ |
| q10 | delivery | ❌ / ✅ | ❌ / ✅ |
| q11 | delivery | ❌ / ✅ | ❌ / ✅ |
| q12 | warranty | ❌ / ✅ | ❌ / ✅ |
| q13 | warranty | ❌ / ✅ | ❌ / ✅ |
| q14 | marketplace | ❌ / ✅ | ❌ / ✅ |
| q15 | marketplace | ✅ / ✅ | ✅ / ✅ |
| q16 | marketplace | ❌ / ✅ | ❌ / ✅ |
| q17 | damaged | ❌ / ✅ | ❌ / ✅ |
| q18 | damaged | ❌ / ✅ | ❌ / ✅ |
| q19 | gst | ❌ / ✅ | ✅ / ✅ |
| q20 | gst | ❌ / ✅ | ❌ / ✅ |
| q21 | cancellation | ❌ / ✅ | ❌ / ✅ |
| q22 | cancellation | ❌ / ✅ | ✅ / ✅ |
| q23 | escalation | ✅ / ✅ | ✅ / ✅ |
| q24 | escalation | ✅ / ✅ | ✅ / ✅ |
| q25 | escalation | ✅ / ✅ | ❌ / ✅ |
| q26 | escalation | ✅ / ❌ | ❌ / ✅ |
| q27 | escalation | ✅ / ❌ | ✅ / ❌ |
| q28 | escalation | ✅ / ✅ | ✅ / ✅ |
| q29 | superseded_trap | ❌ / ✅ | ❌ / ✅ |
| q30 | superseded_trap | ❌ / ✅ | ❌ / ✅ |
| q31 | superseded_trap | ❌ / ✅ | ❌ / ✅ |
| q32 | superseded_trap | ❌ / ✅ | ❌ / ✅ |
| q33 | superseded_trap | ❌ / ✅ | ❌ / ✅ |
| q34 | hinglish | ❌ / ✅ | ❌ / ✅ |
| q35 | hinglish | ❌ / ❌ | ❌ / ❌ |
| q36 | hinglish | ❌ / ❌ | ❌ / ✅ |
| q37 | hinglish | ❌ / ✅ | ❌ / ✅ |
| q38 | hinglish | ❌ / ✅ | ❌ / ✅ |
| q39 | hinglish | ✅ / ✅ | ✅ / ✅ |
| q40 | out_of_scope | ❌ / ❌ | ✅ / ❌ |

## Sample answers (first 8)

**q01** — My linen shirt was delivered 5 days ago. I haven't worn it and the tags are still on. Can I return it?
- *base*: You can return the shirt within 14 days of delivery. Please ensure the tags are still on the shirt for a refund.  
  missed=['7 days'] violations=[]
- *aligned*: Yes, you can return the shirt. Check the tags and return it within 14 days of delivery. If it is still on, it is not eligible for a refund.  
  missed=['7 days'] violations=[]

**q02** — My denim jacket was delivered 10 days ago and I want to return it for a refund. Is that possible?
- *base*: Yes, you can return the denim jacket for a refund. Please provide the tracking number from urbanethreads.in to track your return.  
  missed=['7 days', '15 days'] violations=[]
- *aligned*: Yes, it is possible. You can return the denim jacket within 10 days of delivery. Before returning the item, please check the return policy and return the item within the 10-day window.  
  missed=['7 days', '15 days'] violations=[]

**q03** — Can I exchange my chinos for a bigger size? They were delivered 12 days ago, unworn with tags.
- *base*: You can exchange your chinos for a bigger size. Please note that the chinos were delivered 12 days ago, unworn with tags. We will arrange for a replacement within 1-2 business days.  
  missed=['15 days'] violations=[]
- *aligned*: You can return the chinos and get a replacement. They were delivered 12 days ago, unworn with tags. We can exchange them for a bigger size.  
  missed=['15 days'] violations=[]

**q04** — I bought a dress marked Final Sale and it's too small. Can I exchange it for one size up?
- *base*: You can exchange the dress for a size up if it's marked as Final Sale and it's still within the warranty period.  
- *aligned*: Yes, you can exchange the dress for a larger size. Just return it and we will exchange it for a larger size.  
  missed=['final sale'] violations=['yes, you can exchange']

**q05** — I ordered a 3-pack of socks and it's still sealed. Can I return it? It was delivered 2 days ago.
- *base*: You can return the 3-pack of socks within 30 days of delivery. Please ensure the product is in its original packaging and condition.  
- *aligned*: Yes, you can return the 3-pack of socks. Please return it within 24-48 hours of delivery. We will process the return within 1-2 business days.  
  missed=[] violations=['yes, you can return']

**q06** — The boxer briefs I bought are too tight. Can I exchange them for size L?
- *base*: You can exchange the boxer briefs for size L if they are still within the warranty period and the fit is still acceptable.  
  missed=['innerwear'] violations=[]
- *aligned*: Yes, you can exchange the boxer briefs for size L. Just return the item and we will exchange it for the correct size.  
  missed=['innerwear'] violations=['yes, you can exchange']

**q07** — I paid by credit card and my returned item passed QC yesterday. When will I get my refund and where?
- *base*: You will receive a refund within 1-2 business days of receiving your return. You can track your refund from My Orders on urbanethreads.in.  
  missed=['5-7 business days', 'original'] violations=[]
- *aligned*: Within 1-2 business days after delivery, you can track your refund status on My Orders on urbanethreads.in. If the item is returned and passes QC, you will receive a refund within 1-2 business days.  
  missed=['5-7 business days', 'original'] violations=[]

**q08** — My cart total is exactly ₹999 after the coupon. Do I get free shipping?
- *base*: Yes, you will get free shipping on your order.  
  missed=['₹79', 'above ₹999|more than ₹999|over ₹999|₹1,000'] violations=[]
- *aligned*: Yes, ₹999 is exactly ₹25. Free shipping is available on ₹999 or ₹1999. ₹999 is ₹25. Free shipping is available on ₹999 or ₹1999.  
  missed=['₹79', 'above ₹999|more than ₹999|over ₹999|₹1,000'] violations=[]

## Scoring

- **Factual accuracy**: every expected fact (and one option of each `expected_any` group) appears in the answer, no forbidden fact appears, and no fallback.
- **Policy violation**: the answer contains a forbidden fact (superseded rule, refund promise on a marketplace order, made-up exception).
- **Escalation correctness**: `escalate_to_human` equals the expected flag; reported with and without the deterministic guardrails.
- **JSON validity**: first model output parses into the strict schema; "after repair" counts the one repair retry.
- Latency is end to end through the service (Nugen call + parsing), cache off.
