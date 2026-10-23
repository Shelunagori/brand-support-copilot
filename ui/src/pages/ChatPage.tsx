import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, Eraser, MessagesSquare, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlignedOfflineBadge, AlignedReliabilityNote } from '../components/support/AlignedOffline';
import { AnswerCard } from '../components/support/AnswerCard';
import { AccessGate, DemoLimitCard } from '../components/demo/DemoGate';
import { useDemoAccess } from '../lib/demo';
import { Button, Kbd, PageHeader } from '../components/ui/primitives';
import { Segmented } from '../components/ui/widgets';
import { api, ApiError } from '../lib/api';
import { EXAMPLES } from '../lib/examples';
import type { ModelKind } from '../lib/types';
import { initialStream, runStream, type StreamState } from '../lib/useStream';
import { useResource } from '../lib/useResource';


interface Turn {
  id: number;
  stream: StreamState;
}

// Survives route changes within the session (not persisted).
let cache: Turn[] = [];
let nextId = 1;

export function ModelToggle({
  value,
  onChange,
  alignedOffline = false,
}: {
  value: ModelKind;
  onChange: (m: ModelKind) => void;
  alignedOffline?: boolean;
}) {
  return (
    <Segmented
      label="Model"
      size="sm"
      value={value}
      onChange={onChange}
      options={[
        {
          value: 'aligned',
          label: 'Aligned',
          icon: <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />,
          title: alignedOffline ? 'Aligned model offline (undeployed to save credits)' : 'Nugen domain-aligned model',
          disabled: alignedOffline,
        },
        {
          value: 'base',
          label: 'Base',
          icon: <span className="h-1.5 w-1.5 rounded-full bg-violet" aria-hidden />,
          title: 'Base model, same prompt',
        },
      ]}
    />
  );
}

export function ChatPage() {
  const [turns, setTurns] = useState<Turn[]>(cache);
  const [input, setInput] = useState('');
  const [model, setModel] = useState<ModelKind>('aligned');
  const controllers = useRef(new Map<number, AbortController>());
  const endRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  /** Scroll so the newest message clears the sticky composer (and the mobile tab bar). */
  const scrollToEnd = useCallback((behavior: ScrollBehavior = 'auto') => {
    const end = endRef.current;
    if (!end) return;
    const composerTop = composerRef.current?.getBoundingClientRect().top ?? window.innerHeight;
    const covered = Math.max(0, window.innerHeight - composerTop);
    end.style.scrollMarginBottom = `${covered + 16}px`;
    end.scrollIntoView({ behavior, block: 'end' });
  }, []);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // re-check availability: the aligned model can be (re)deployed or auto-undeployed at any time
  const models = useResource(({ signal }) => api.models({ signal }), 60000);
  const busy = turns.some((t) => t.stream.status === 'streaming');
  const { access, status: demo } = useDemoAccess();
  const canSend = access === 'open';

  useEffect(() => {
    cache = turns;
  }, [turns]);

  useEffect(() => {
    const ctrls = controllers.current;
    return () => {
      ctrls.forEach((c) => c.abort());
      cache = cache.map((t) =>
        t.stream.status === 'streaming'
          ? { ...t, stream: { ...t.stream, status: 'error', error: new ApiError(0, '/v1/support/stream', 'Interrupted — you left the page mid-stream.') } }
          : t,
      );
    };
  }, []);

  const start = useCallback((id: number, query: string, m: ModelKind) => {
    const ctrl = new AbortController();
    controllers.current.set(id, ctrl);
    const update = (fn: (s: StreamState) => StreamState) =>
      setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, stream: fn(t.stream) } : t)));
    void runStream(query, m, update, ctrl.signal).finally(() => controllers.current.delete(id));
  }, []);

  const send = (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || busy || !canSend) return;
    const id = nextId++;
    setTurns((ts) => [...ts, { id, stream: initialStream(q, model) }]);
    setInput('');
    start(id, q, model);
    requestAnimationFrame(() => scrollToEnd('smooth'));
  };

  const retry = (t: Turn) => {
    setTurns((ts) => ts.map((x) => (x.id === t.id ? { ...x, stream: initialStream(t.stream.query, t.stream.model) } : x)));
    start(t.id, t.stream.query, t.stream.model);
  };

  // keep the newest reply in view while it streams, and once more when it completes
  // (the finished card grows: confidence, badges, footer)
  const last = turns[turns.length - 1];
  const lastStatus = last?.stream.status;
  useEffect(() => {
    if (lastStatus === 'streaming' || lastStatus === 'done') requestAnimationFrame(() => scrollToEnd());
  }, [last?.stream.text.length, lastStatus, scrollToEnd]);

  const alignedOffline = !!models.data && !models.data.aligned_model_id;

  // Follow availability: aligned is the default whenever it is deployed, base when it is not
  // (runs on transitions only, so a manual choice sticks until availability changes).
  const alignedKnown = !!models.data;
  useEffect(() => {
    if (alignedKnown) setModel(alignedOffline ? 'base' : 'aligned');
  }, [alignedOffline, alignedKnown]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Support Chat"
        icon={<MessagesSquare className="h-5 w-5" aria-hidden />}
        description="Ask what an Urbane Threads customer would ask. Replies stream live with intent, policy citation, confidence and escalation."
        actions={
          turns.length > 0 && access !== 'locked' && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Eraser className="h-3.5 w-3.5" aria-hidden />}
              onClick={() => {
                controllers.current.forEach((c) => c.abort());
                setTurns([]);
              }}
            >
              Clear
            </Button>
          )
        }
      />

      {access === 'locked' ? (
        <AccessGate status={demo} />
      ) : (
        <>
          <section aria-label="Conversation" className="space-y-6">
            {access === 'limit' && <DemoLimitCard status={demo} />}
            <AnimatePresence initial={false}>
              {turns.length === 0 && access !== 'limit' && (
                <motion.div
                  key="hero"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="glass relative overflow-hidden px-4 py-7 text-center sm:px-10 sm:py-12"
                >
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[28rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-violet/25 via-accent/15 to-violet/10 blur-3xl"
                  />
                  <div className="relative mx-auto mb-4 hidden h-12 w-12 place-items-center sm:grid rounded-2xl bg-gradient-to-br from-violet/30 to-accent/20 text-accent-text ring-1 ring-inset ring-line">
                    <Sparkles className="h-5 w-5" aria-hidden />
                  </div>
                  <h2 className="relative text-base font-semibold sm:text-lg tracking-tight text-ink">How can we help an Urbane Threads customer?</h2>
                  <p className="relative mx-auto mt-1.5 max-w-md text-sm text-ink-muted">
                    Try one of these — they cover returns windows, Hinglish, chargeback threats and outdated-policy claims.
                  </p>
                  <div className="relative mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
                    {EXAMPLES.map((e, i) => (
                      <motion.button
                        key={e}
                        type="button"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0, transition: { delay: 0.05 * i } }}
                        whileHover={{ y: -2 }}
                        onClick={() => send(e)}
                        disabled={!canSend}
                        className="w-full rounded-xl border border-line bg-surface/80 px-3.5 py-1.5 text-left text-[13px] text-ink-muted shadow-glass transition-colors hover:border-accent/40 hover:text-ink sm:w-auto sm:rounded-full sm:py-1.5"
                      >
                        {e}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {turns.map((t) => (
              <div key={t.id} className="space-y-3">
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-br from-violet/90 to-violet/75 px-4 py-2.5 text-[15px] leading-6 text-white shadow-lift dark:from-violet/40 dark:to-violet/25 dark:text-ink dark:ring-1 dark:ring-inset dark:ring-violet/40">
                    {t.stream.query}
                  </div>
                </motion.div>
                <AnswerCard s={t.stream} onRetry={() => retry(t)} />
              </div>
            ))}
            <div ref={endRef} />
          </section>

          {/* composer */}
          <div ref={composerRef} className="sticky bottom-20 z-30 mt-6 md:bottom-6">
            {model === 'aligned' && !alignedOffline && <AlignedReliabilityNote className="mb-2" />}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="glass p-2 shadow-lift focus-within:shadow-glow"
              style={{ background: 'rgb(var(--surface) / 0.88)' }}
            >
              {turns.length > 0 && (
                <div className="-mx-1 mb-1 flex gap-1.5 overflow-x-auto px-1 pb-1 pt-0.5 [mask-image:linear-gradient(90deg,#000_85%,transparent)] [scrollbar-width:none]">
                  {EXAMPLES.map((e) => (
                    <button
                      key={e}
                      type="button"
                      disabled={busy || !canSend}
                      onClick={() => send(e)}
                      className="shrink-0 rounded-full border border-line/80 bg-surface-2/70 px-2.5 py-1 text-xs text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
                    >
                      {e.length > 38 ? `${e.slice(0, 36)}…` : e}
                    </button>
                  ))}
                </div>
              )}
              <label htmlFor="composer" className="sr-only">
                Customer message
              </label>
              <textarea
                id="composer"
                ref={inputRef}
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
                disabled={!canSend}
                placeholder={access === 'limit' ? 'Live chat is paused: the demo limit was reached' : 'Type a customer message…'}
                className="block max-h-40 min-h-[52px] w-full resize-none bg-transparent px-3 py-2 text-[15px] text-ink placeholder:text-ink-subtle focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              />
              <div className="flex items-center gap-2 px-1 pb-0.5">
                <ModelToggle value={model} onChange={setModel} alignedOffline={alignedOffline} />
                {alignedOffline ? (
                  <AlignedOfflineBadge modelId={models.data?.offline_aligned_model_id} className="min-w-0 truncate" />
                ) : (
                  <span className="hidden text-xs text-ink-subtle sm:inline">
                    <Kbd>Enter</Kbd> to send · <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> newline
                  </span>
                )}
                <Button
                  type="submit"
                  variant="primary"
                  className="ml-auto !h-9 !w-9 !px-0"
                  disabled={!input.trim() || busy || !canSend}
                  loading={busy}
                  aria-label="Send message"
                  icon={busy ? undefined : <ArrowUp className="h-4 w-4" aria-hidden />}
                />
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
