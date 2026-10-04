import { Alert, AlertDescription } from '@/components/ui/alert';
import type { ApiErrorDescription } from '@/lib/apiErrors';

export interface FailureAlertProps {
  failure: ApiErrorDescription;
}

/** Błąd decyzji w modalu: zdanie po polsku, a angielski `detail` silnika drobnym drukiem pod spodem. */
export function FailureAlert({ failure }: FailureAlertProps): React.JSX.Element {
  return (
    <Alert variant="destructive">
      <AlertDescription>
        {failure.message}
        {failure.detail === null ? null : (
          <span className="mt-1 block text-xs text-muted-foreground">{failure.detail}</span>
        )}
      </AlertDescription>
    </Alert>
  );
}
