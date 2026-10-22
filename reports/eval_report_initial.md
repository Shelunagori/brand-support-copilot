# Eval report — initial alignment

Generated 2026-10-22T13:18:58.269683+00:00 · 40 held-out questions · same prompt for every model, no retrieval.

| Metric | base (`Qwen/Qwen2.5-0.5B-Instruct`) | aligned (`model_01m5hvz1m0n0bn6r`) | Δ aligned − base |
|---|---|---|---|
| Factual accuracy | 27.5% | 25.0% | -2.5 pp |
| Policy violations (lower is better) | 5.0% | 10.0% | +5.0 pp |
| Escalation correctness (with guardrails) | 92.5% | 90.0% | -2.5 pp |
| Escalation correctness (model only) | 85.0% | 85.0% | +0.0 pp |
| JSON valid on first try | 100.0% | 95.0% | -5.0 pp |
| JSON valid after repair | 100.0% | 100.0% | +0.0 pp |
| Correct policy_ref | 32.5% | 2.5% | -30.0 pp |
| Latency p50 (ms) | 5,916 | 5,735 | -181 |
| Latency p95 (ms) | 11,991 | 10,820 | -1,170 |
| Total tokens | 20,879 | 22,470 | +1,591 |
| Est. cost (USD) | $0.0042 | $0.0045 | +0.0003 |

## Accuracy by category

| Category | n | base | aligned |
|---|---|---|---|
| cancellation | 2 | 0/2 | 1/2 |
| damaged | 2 | 0/2 | 0/2 |
| delivery | 2 | 0/2 | 0/2 |
| escalation | 6 | 6/6 | 6/6 |
| exchange | 2 | 1/2 | 0/2 |
| gst | 2 | 0/2 | 0/2 |
| hinglish | 6 | 1/6 | 1/6 |
| marketplace | 3 | 1/3 | 1/3 |
| non_returnable | 2 | 1/2 | 0/2 |
| out_of_scope | 1 | 1/1 | 0/1 |
| refunds | 1 | 0/1 | 0/1 |
| returns | 2 | 0/2 | 0/2 |
| shipping | 2 | 0/2 | 0/2 |
| superseded_trap | 5 | 0/5 | 1/5 |
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
| q19 | gst | ❌ / ✅ | ❌ / ✅ |
| q20 | gst | ❌ / ✅ | ❌ / ✅ |
| q21 | cancellation | ❌ / ✅ | ❌ / ✅ |
| q22 | cancellation | ❌ / ✅ | ✅ / ✅ |
| q23 | escalation | ✅ / ✅ | ✅ / ✅ |
| q24 | escalation | ✅ / ✅ | ✅ / ✅ |
| q25 | escalation | ✅ / ✅ | ✅ / ✅ |
| q26 | escalation | ✅ / ✅ | ✅ / ❌ |
| q27 | escalation | ✅ / ❌ | ✅ / ❌ |
| q28 | escalation | ✅ / ✅ | ✅ / ✅ |
| q29 | superseded_trap | ❌ / ✅ | ❌ / ✅ |
| q30 | superseded_trap | ❌ / ✅ | ❌ / ✅ |
| q31 | superseded_trap | ❌ / ✅ | ❌ / ✅ |
| q32 | superseded_trap | ❌ / ✅ | ✅ / ✅ |
| q33 | superseded_trap | ❌ / ✅ | ❌ / ✅ |
| q34 | hinglish | ❌ / ✅ | ❌ / ✅ |
| q35 | hinglish | ❌ / ❌ | ❌ / ❌ |
| q36 | hinglish | ❌ / ✅ | ❌ / ✅ |
| q37 | hinglish | ❌ / ✅ | ❌ / ✅ |
| q38 | hinglish | ❌ / ✅ | ❌ / ✅ |
| q39 | hinglish | ✅ / ✅ | ✅ / ✅ |
| q40 | out_of_scope | ✅ / ❌ | ❌ / ❌ |

## Sample answers (first 8)

**q01** — My linen shirt was delivered 5 days ago. I haven't worn it and the tags are still on. Can I return it?
- *base*: You can return the shirt within 5 days of delivery. Please ensure the tags are still attached to the shirt.  
  missed=['7 days'] violations=[]
- *aligned*: Yes, you can return the shirt. If the tags are still on, they are valid. If the tags are not on, return it within 14 days from the delivery date.  
  missed=['7 days'] violations=[]

**q02** — My denim jacket was delivered 10 days ago and I want to return it for a refund. Is that possible?
- *base*: Yes, you can return the denim jacket for a refund. Please provide the tracking number from urbanethreads.in to track your return.  
  missed=['7 days', '15 days'] violations=[]
- *aligned*: Yes, it is possible to return the denim jacket. You can return it within 14 days from the delivery date. If the item is returned within 14 days, a refund will be issued.  
  missed=['7 days', '15 days'] violations=[]

**q03** — Can I exchange my chinos for a bigger size? They were delivered 12 days ago, unworn with tags.
- *base*: You can exchange your chinos for a bigger size. Please note that the chinos were delivered 12 days ago, unworn with tags. We will provide you with a replacement within 1-2 business days.  
  missed=['15 days'] violations=[]
- *aligned*: You can exchange your chinos for a bigger size. The item is unworn and has tags. We can exchange it for a larger size.  
  missed=['15 days'] violations=[]

**q04** — I bought a dress marked Final Sale and it's too small. Can I exchange it for one size up?
- *base*: You can exchange the dress for one size up if it's marked as Final Sale and it's still within the warranty period.  
- *aligned*: Yes, you can exchange the dress for a size up. If the dress is marked Final Sale, it is not eligible for exchange. If it is not marked Final Sale, you can return it within 7 days and we will exchange it for a size up.  
  missed=[] violations=['yes, you can exchange']

**q05** — I ordered a 3-pack of socks and it's still sealed. Can I return it? It was delivered 2 days ago.
- *base*: You can return the 3-pack of socks within 30 days of delivery. Please ensure the socks are in good condition and return them to urbanethreads.in or a store of your choice.  
- *aligned*: Yes, you can return the 3-pack of socks. Just return it within 24-48 hours and we will process the refund.  
  missed=[] violations=['yes, you can return']

**q06** — The boxer briefs I bought are too tight. Can I exchange them for size L?
- *base*: You can exchange the boxer briefs for size L if they are still within the warranty period and the fit is still acceptable. Please ensure the fit is still comfortable and the box is still in good condition.  
  missed=['innerwear'] violations=[]
- *aligned*: Exchange the boxer briefs for size L. If the size is not available, return the item.  
  missed=['innerwear'] violations=[]

**q07** — I paid by credit card and my returned item passed QC yesterday. When will I get my refund and where?
- *base*: You will receive a refund within 10 days of the return date. Please check your account for the refund details.  
  missed=['5-7 business days', 'original'] violations=[]
- *aligned*: You should expect a refund within 7-10 business days. If the return is not accepted or is rejected, you can request a refund within 14 days from the date of delivery.  
  missed=['5-7 business days', 'original'] violations=[]

**q08** — My cart total is exactly ₹999 after the coupon. Do I get free shipping?
- *base*: Yes, you will get free shipping on your order.  
  missed=['₹79', 'above ₹999|more than ₹999|over ₹999|₹1,000'] violations=[]
- *aligned*: ₹999 is exactly ₹999, so free shipping is not applicable.  
  missed=['₹79', 'above ₹999|more than ₹999|over ₹999|₹1,000'] violations=[]

## Scoring

- **Factual accuracy**: every expected fact (and one option of each `expected_any` group) appears in the answer, no forbidden fact appears, and no fallback.
- **Policy violation**: the answer contains a forbidden fact (superseded rule, refund promise on a marketplace order, made-up exception).
- **Escalation correctness**: `escalate_to_human` equals the expected flag; reported with and without the deterministic guardrails.
- **JSON validity**: first model output parses into the strict schema; "after repair" counts the one repair retry.
- Latency is end to end through the service (Nugen call + parsing), cache off.
