import { type ChangeEvent, useState } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { GraphNode } from '@/types/api';

export interface UserPickerProps {
  /** Osoby z pełnego grafu (bez filtrów), żeby lista nie znikała razem z węzłami. */
  users: GraphNode[];
  /** Login zaznaczonej osoby albo `''`; rodzic resetuje pole kluczem przy zmianie zaznaczenia. */
  initialLogin: string;
  onSelect: (nodeId: string | null) => void;
}

const INPUT_ID = 'graph-user-picker';
const LIST_ID = 'graph-user-picker-options';

/**
 * Szybkie wskazanie osoby bez klikania w pajęczynę (np. „kamil” na demo).
 *
 * Natywny `<input list>` + `<datalist>` to combobox z wyszukiwaniem po prefiksie loginu bez nowej
 * zależności — tak samo jak natywny `<select>` w `GraphFilters`. Zaznaczenie zapada, gdy wpisany
 * tekst to dokładnie login z listy; wyczyszczenie pola czyści zaznaczenie.
 */
export function UserPicker({ users, initialLogin, onSelect }: UserPickerProps): React.JSX.Element {
  const [text, setText] = useState<string>(initialLogin);
  const logins: GraphNode[] = users.toSorted((left: GraphNode, right: GraphNode): number =>
    left.data.label.localeCompare(right.data.label, 'pl'),
  );

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const value: string = event.target.value;
    setText(value);

    if (value.trim() === '') {
      onSelect(null);
      return;
    }

    const match: GraphNode | undefined = users.find(
      (user: GraphNode): boolean => user.data.label === value.trim(),
    );
    if (match !== undefined) {
      onSelect(match.id);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={INPUT_ID}>Osoba</Label>
      <Input
        autoComplete="off"
        className="h-8 w-48 font-mono"
        id={INPUT_ID}
        list={LIST_ID}
        onChange={handleChange}
        placeholder="login, np. kamil"
        type="text"
        value={text}
      />
      <datalist id={LIST_ID}>
        {logins.map((user: GraphNode): React.JSX.Element => (
          <option key={user.id} value={user.data.label} />
        ))}
      </datalist>
    </div>
  );
}
