# Benchmark data

`benchmark.json` is a JSON array of 30 `{sample_num, instruction, response}` customer-support Q&A pairs for Urbane Threads.
Every response follows the ACTIVE policy pack in `data/docs/` exactly, is concise, and cites its policy id, e.g. "(Policy UT-RET-001)".
It covers returns, exchanges, refunds, shipping/COD, delivery, warranty, marketplace redirects, damage claims, GST, cancellation, escalation and Hinglish.
Scenarios are deliberately different from `data/eval/questions.jsonl`, which stays held-out for evaluation.
