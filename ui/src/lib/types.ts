export type ModelKind = 'aligned' | 'base';

export interface Health {
  status: string;
  checks?: { postgres?: string; redis?: string };
}

export interface ModelsInfo {
  aligned_model_id: string | null;
  base_model_id: string;
  aligned_available?: boolean;
  offline_aligned_model_id?: string | null;
  aligned_notice?: string | null;
}

export interface SupportResponse {
  intent: string;
  answer: string;
  policy_ref: string | null;
  escalate_to_human: boolean;
  confidence: number;
  model_id: string;
  latency_ms: number;
  model_kind: ModelKind;
  request_id: string;
  cached: boolean;
  repaired: boolean;
  fallback: boolean;
  json_valid_first_try: boolean;
  guardrail_triggers: string[];
  error: string | null;
  notice?: string | null;
  total_tokens: number;
  inference_id: string | null;
}

export interface StreamMeta {
  request_id: string;
  model_id: string | null;
  model_kind: ModelKind;
}

export type RunState =
  | 'CREATED'
  | 'DOCS_UPLOADED'
  | 'DOCS_READY'
  | 'BENCHMARK_READY'
  | 'ALIGNMENT_STARTED'
  | 'ALIGNED'
  | 'DEPLOYING'
  | 'DEPLOYED'
  | 'FAILED';

export interface RunEvent {
  step: string;
  status: string;
  detail: Record<string, unknown> | null;
  at: string;
}

export interface PipelineRun {
  id: string;
  name: string;
  kind: 'initial' | 'realign';
  state: RunState;
  base_model_id: string | null;
  document_ids: string[] | null;
  document_names: string[] | null;
  benchmark_id: string | null;
  alignment_id: string | null;
  alignment_status: string | null;
  evaluation_id: string | null;
  model_id: string | null;
  deployment_status: string | null;
  last_error: string | null;
  parent_run_id: string | null;
  created_at: string;
  updated_at: string;
  events: RunEvent[];
}

export interface JobAccepted {
  status: string;
  job_id?: string | null;
  dataset_items?: number;
}

export interface SpendRow {
  purpose: string;
  endpoint: string;
  calls: number;
  tokens: number;
  est_cost_usd: number;
}

export interface Spend {
  total_est_usd: number;
  hard_limit_usd: number;
  breakdown: SpendRow[];
}

export interface EvalMetrics {
  model_id: string;
  n: number;
  factual_accuracy: number;
  policy_violation_rate: number;
  escalation_accuracy: number;
  json_validity: number;
  policy_ref_accuracy: number;
  latency_p50_ms: number;
  latency_p95_ms: number;
  total_tokens: number;
  est_cost_usd: number;
}

export interface EvalResult {
  answer: string;
  escalate_to_human: boolean;
  policy_ref: string | null;
  facts_hit: string[];
  facts_missed: string[];
  violations: string[];
  correct: boolean;
  escalation_correct: boolean;
  json_valid: boolean;
  latency_ms: number;
}

export interface EvalQuestion {
  id: string;
  category: string;
  question: string;
  expected_escalate: boolean;
  expected_policy_ref: string | null;
  results: { base?: EvalResult; aligned?: EvalResult };
}

export interface EvalSummary {
  base?: EvalMetrics;
  aligned?: EvalMetrics;
}

export interface EvalReport {
  generated_at: string;
  summary: EvalSummary;
  questions: EvalQuestion[];
}

export interface EvalHistoryEntry {
  id: string;
  label: string;
  generated_at: string;
  summary: EvalSummary;
}

export interface FeedbackBody {
  inference_id: string;
  rating: 'up' | 'down';
  correction?: string;
  comment?: string;
}

export interface FlaggedItem {
  inference_id: string;
  query: string;
  answer: string;
  intent: string;
  policy_ref: string | null;
  escalate_to_human: boolean;
  confidence: number;
  model_id: string;
  flags: string[];
  correction: string | null;
  created_at: string;
}

export interface FeedbackStats {
  total_inferences: number;
  flagged: number;
  thumbs_down: number;
  corrections: number;
  by_flag: Record<string, number>;
}

export interface RealignItem {
  instruction: string;
  response: string;
  source: string;
}

export interface RealignDataset {
  items: RealignItem[];
  count: number;
}
