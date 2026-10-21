import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui/states';

export function NotFoundPage() {
  return (
    <EmptyState
      icon={<Compass className="h-6 w-6" aria-hidden />}
      title="Page not found"
      body="That route doesn't exist in this workspace."
      action={
        <Link to="/" className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-ink">
          Back to Support Chat
        </Link>
      }
    />
  );
}
