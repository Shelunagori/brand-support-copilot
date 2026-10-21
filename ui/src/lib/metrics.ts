import { ms, pct, usd } from './format';
import type { EvalMetrics } from './types';

export type MetricKey = Exclude<keyof EvalMetrics, 'model_id' | 'n' | 'total_tokens'>;

export interface MetricDef {
  key: MetricKey;
  label: string;
  short: string;
  kind: 'rate' | 'ms' | 'usd';
  better: 'higher' | 'lower';
}

export const METRICS: MetricDef[] = [
  { key: 'factual_accuracy', label: 'Factual accuracy', short: 'Accuracy', kind: 'rate', better: 'higher' },
  { key: 'escalation_accuracy', label: 'Escalation accuracy', short: 'Escalation', kind: 'rate', better: 'higher' },
  { key: 'json_validity', label: 'JSON validity', short: 'JSON valid', kind: 'rate', better: 'higher' },
  { key: 'policy_ref_accuracy', label: 'Policy-ref accuracy', short: 'Policy ref', kind: 'rate', better: 'higher' },
  { key: 'policy_violation_rate', label: 'Policy violations', short: 'Violations', kind: 'rate', better: 'lower' },
  { key: 'latency_p50_ms', label: 'Latency p50', short: 'p50', kind: 'ms', better: 'lower' },
  { key: 'latency_p95_ms', label: 'Latency p95', short: 'p95', kind: 'ms', better: 'lower' },
  { key: 'est_cost_usd', label: 'Eval cost', short: 'Cost', kind: 'usd', better: 'lower' },
];

export const fmtMetric = (kind: MetricDef['kind'], v: number) =>
  kind === 'rate' ? pct(v, 1) : kind === 'ms' ? ms(v) : usd(v);
