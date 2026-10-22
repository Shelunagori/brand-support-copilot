import { PowerOff, Terminal } from 'lucide-react';
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
  return (
    <Card>
      <EmptyState
        icon={<PowerOff className="h-6 w-6" aria-hidden />}
        title="Aligned model offline"
        body={`${modelId ? `${modelId} was ` : 'The aligned model was '}undeployed to save credits, so only the base model answered. Redeploy it to compare side by side.`}
        action={
          <code className="inline-flex items-center gap-1.5 rounded-lg bg-surface-3/70 px-2.5 py-1 font-mono text-xs text-ink ring-1 ring-inset ring-line">
            <Terminal className="h-3.5 w-3.5" aria-hidden />
            make demo-redeploy
          </code>
        }
      />
    </Card>
  );
}
