import { Info, PowerOff, Terminal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useIsDemo } from '../../lib/demo';
import { Card, Pill } from '../ui/primitives';
import { EmptyState } from '../ui/states';

export const OFFLINE_LABEL = 'Aligned model offline (undeployed to save credits)';

function hint(modelId?: string | null) {
  return `${modelId ? `${modelId} is undeployed. ` : ''}Answers come from the base model. Run \`make demo-redeploy\` to bring it back.`;
}

export function AlignedOfflineBadge({ modelId, className }: { modelId?: string | null; className?: string }) {
  return (
    <Pill tone="warn" role="status" className={className} title={hint(modelId)} icon={<PowerOff className="h-3 w-3" aria-hidden />}>
      {OFFLINE_LABEL}
    </Pill>
  );
}

export function AlignedOfflineCard({ modelId }: { modelId?: string | null }) {
  const demo = useIsDemo();
  return (
    <Card>
      <EmptyState
        icon={<PowerOff className="h-6 w-6" aria-hidden />}
        title="Aligned model offline"
        body={
          demo
            ? 'The aligned model is undeployed to save credits, so only the base model answered. Its measured results are on the Eval Dashboard.'
            : `${modelId ? `${modelId} was ` : 'The aligned model was '}undeployed to save credits, so only the base model answered. Redeploy it to compare side by side.`
        }
        action={
          demo ? (
            <Link to="/eval" className="text-sm font-medium text-accent-text underline-offset-2 hover:underline">
              Open Eval Dashboard →
            </Link>
          ) : (
            <code className="inline-flex items-center gap-1.5 rounded-lg bg-surface-3/70 px-2.5 py-1 font-mono text-xs text-ink ring-1 ring-inset ring-line">
              <Terminal className="h-3.5 w-3.5" aria-hidden />
              make demo-redeploy
            </code>
          )
        }
      />
    </Card>
  );
}

/** Honest caveat shown wherever the Exp 3 aligned model answers live (Chat + Compare). */
export function AlignedReliabilityNote({ className }: { className?: string }) {
  return (
    <p
      data-testid="aligned-note"
      className={`flex items-start gap-1.5 rounded-xl bg-surface/90 px-3 py-2 text-xs text-ink-muted shadow-glass ring-1 ring-inset ring-line/70 backdrop-blur ${className ?? ''}`}
    >
      <Info className="mt-px h-3.5 w-3.5 shrink-0 text-accent-text" aria-hidden />
      <span>
        Exp 3 aligned model: learned the brand&apos;s format and policy citations, but not reliable on facts.{' '}
        <Link to="/eval" className="font-medium text-accent-text underline-offset-2 hover:underline">
          See Eval Dashboard
        </Link>
        .
      </span>
    </p>
  );
}
