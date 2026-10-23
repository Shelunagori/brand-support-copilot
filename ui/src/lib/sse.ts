import { API_BASE, ApiError, detailOf, errorMessage, headers } from './api';
import type { ModelKind, StreamMeta, SupportResponse } from './types';

export interface StreamHandlers {
  onMeta?: (m: StreamMeta) => void;
  onToken?: (text: string) => void;
  onAnswerDelta?: (text: string) => void;
  onConfidence?: (value: number) => void;
  onRepaired?: (answer: string) => void;
  onFinal?: (r: SupportResponse) => void;
}

interface RawEvent {
  event: string;
  data: string;
}

/** Incremental SSE parser: feed text chunks, get complete events. */
export function createSseParser(emit: (e: RawEvent) => void) {
  let buffer = '';
  const flush = (blockText: string) => {
    let event = 'message';
    const data: string[] = [];
    for (const line of blockText.split('\n')) {
      if (!line || line.startsWith(':')) continue;
      const idx = line.indexOf(':');
      const field = idx === -1 ? line : line.slice(0, idx);
      let value = idx === -1 ? '' : line.slice(idx + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'event') event = value;
      else if (field === 'data') data.push(value);
    }
    if (data.length) emit({ event, data: data.join('\n') });
  };
  return {
    push(chunk: string) {
      buffer += chunk.replace(/\r\n?/g, '\n');
      let sep = buffer.indexOf('\n\n');
      while (sep !== -1) {
        flush(buffer.slice(0, sep));
        buffer = buffer.slice(sep + 2);
        sep = buffer.indexOf('\n\n');
      }
    },
    end() {
      if (buffer.trim()) flush(buffer);
      buffer = '';
    },
  };
}

/**
 * POST /v1/support/stream and dispatch typed events. Uses fetch + ReadableStream
 * because EventSource cannot send a POST body or custom headers.
 */
export async function streamSupport(
  query: string,
  model: ModelKind,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<SupportResponse> {
  const path = '/v1/support/stream';
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json', Accept: 'text/event-stream' }, { demo: true }),
      body: JSON.stringify({ query, model, use_cache: true }),
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, path, 'Could not reach the API. Is the backend running?');
  }
  // Demo-mode refusals (401 code, 429 limits, 503 not configured) arrive as plain HTTP errors
  // before any SSE event: surface status + detail so the UI can branch on them.
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (res.status === 500 && !text) throw new ApiError(0, path, 'Could not reach the API. Is the backend running?');
    const detail = detailOf(body);
    const msg = res.ok ? 'The stream returned no body.' : errorMessage(res.status, detail);
    throw new ApiError(res.ok ? 502 : res.status, path, msg, detail);
  }

  let final: SupportResponse | null = null;
  const parser = createSseParser(({ event, data }) => {
    let payload: unknown;
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }
    const p = payload as Record<string, unknown>;
    switch (event) {
      case 'meta':
        handlers.onMeta?.(p as unknown as StreamMeta);
        break;
      case 'token':
        if (typeof p.text === 'string') handlers.onToken?.(p.text);
        break;
      case 'answer_delta':
        if (typeof p.text === 'string') handlers.onAnswerDelta?.(p.text);
        break;
      case 'confidence':
        if (typeof p.value === 'number') handlers.onConfidence?.(p.value);
        break;
      case 'repaired':
        if (typeof p.answer === 'string') handlers.onRepaired?.(p.answer);
        break;
      case 'final':
        final = p as unknown as SupportResponse;
        handlers.onFinal?.(final);
        break;
      default:
        break;
    }
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.push(decoder.decode(value, { stream: true }));
  }
  parser.push(decoder.decode());
  parser.end();
  if (!final) throw new ApiError(502, path, 'The stream ended before a final answer arrived.');
  return final;
}
