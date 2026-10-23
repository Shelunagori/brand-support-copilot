import { ApiError } from './api';
import { handleChatError } from './demo';
import { streamSupport } from './sse';
import type { ModelKind, StreamMeta, SupportResponse } from './types';

export interface StreamState {
  status: 'streaming' | 'done' | 'error';
  query: string;
  model: ModelKind;
  meta?: StreamMeta;
  /** Customer-facing text assembled from answer_delta (or final answer). */
  text: string;
  /** Raw model JSON tokens (token events). */
  raw: string;
  confidence: number | null;
  repaired: boolean;
  final?: SupportResponse;
  error?: ApiError;
  startedAt: number;
}

export function initialStream(query: string, model: ModelKind): StreamState {
  return { status: 'streaming', query, model, text: '', raw: '', confidence: null, repaired: false, startedAt: Date.now() };
}

/** Run one streaming request, reporting immutable state patches via `update`. */
export async function runStream(
  query: string,
  model: ModelKind,
  update: (fn: (s: StreamState) => StreamState) => void,
  signal?: AbortSignal,
): Promise<void> {
  try {
    await streamSupport(
      query,
      model,
      {
        onMeta: (meta) => update((s) => ({ ...s, meta })),
        onToken: (t) => update((s) => ({ ...s, raw: s.raw + t })),
        onAnswerDelta: (t) => update((s) => ({ ...s, text: s.text + t })),
        onConfidence: (v) => update((s) => ({ ...s, confidence: v })),
        onRepaired: (answer) => update((s) => ({ ...s, text: answer, repaired: true })),
        onFinal: (final) =>
          update((s) => ({ ...s, final, text: final.answer || s.text, confidence: final.confidence, status: 'done' })),
      },
      signal,
    );
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return;
    const err = handleChatError(
      e instanceof ApiError ? e : new ApiError(0, '/v1/support/stream', e instanceof Error ? e.message : 'Stream failed'),
    );
    update((s) => ({ ...s, status: 'error', error: err }));
  }
}
