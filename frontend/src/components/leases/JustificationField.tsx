import type { ChangeEvent } from 'react';

import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export interface JustificationFieldProps {
  id: string;
  label: string;
  value: string;
  error: string | null;
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

/**
 * Pole uzasadnienia w modalu decyzji — jedno dla deeskalacji, odebrania i odrzucenia odwołania.
 * Błąd walidacji stoi pod polem (`role="alert"`) i jest podpięty przez `aria-describedby`.
 */
export function JustificationField({
  id,
  label,
  value,
  error,
  placeholder,
  disabled = false,
  onChange,
}: JustificationFieldProps): React.JSX.Element {
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        aria-describedby={error === null ? undefined : errorId}
        aria-invalid={error !== null}
        className="min-h-20"
        disabled={disabled}
        id={id}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>): void => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
      {error === null ? null : (
        <p className="text-xs text-status-expired-foreground" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
