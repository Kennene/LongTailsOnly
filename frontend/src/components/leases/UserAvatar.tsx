import { useState } from 'react';

import { avatarUrl } from '@/lib/avatarUrl';

export interface UserAvatarProps {
  initials: string;
  /** Login użytkownika; brak loginu zostawia sam krąg z inicjałami. */
  login?: string;
}

/**
 * Awatar dostępu: generowana ilustracja w neutralnym kręgu, z inicjałami jako podkładem.
 *
 * Obraz pochodzi z `lib/avatarUrl.ts` (DiceBear, seed = login) — **nie** z `github.com/<login>.png`,
 * bo loginy demo kolidują z prawdziwymi kontami GitHuba i do konsoli trafiłyby twarze obcych osób.
 * Ilustracja nie przedstawia nikogo i jest deterministyczna dla loginu.
 *
 * Trzy warstwy odporności, bo to zewnętrzne zapytanie sieciowe na każdy wiersz:
 * 1. **inicjały są pod obrazem**, więc komórka nigdy nie jest pusta (także przed pobraniem),
 * 2. `onError` gasi obraz i zostawia inicjały — brak sieci psuje obraz, nie tabelę,
 * 3. `onLoad` usuwa inicjały, żeby nie przeświecały przez półprzezroczyste fragmenty ilustracji.
 *
 * Krąg jest **taki sam dla wszystkich**: kolor niesie stan dostępu, nie osobę (`DESIGN.md` §1).
 * Stały rozmiar `size-6` (24 px) trzyma wiersz w paśmie 36–40 px (`DESIGN.md` §3) — `size-7`
 * rozdymał go zmierzone do 45 px.
 */
export function UserAvatar({ initials, login }: UserAvatarProps): React.JSX.Element {
  const [loadedLogin, setLoadedLogin] = useState<string | null>(null);
  const [failedLogin, setFailedLogin] = useState<string | null>(null);

  // `failedLogin === login` gasi obraz na dobre: inicjały zostają do końca życia wiersza.
  const src: string | null = login === undefined || failedLogin === login ? null : avatarUrl(login);
  const showInitials: boolean = loadedLogin !== login;

  function handleLoad(): void {
    setLoadedLogin(login === undefined ? null : login);
  }

  function handleError(): void {
    setFailedLogin(login === undefined ? null : login);
  }

  return (
    <span
      aria-hidden="true"
      className="relative flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-xs font-medium text-muted-foreground select-none"
    >
      {showInitials ? initials : null}
      {src === null ? null : (
        <img
          alt=""
          aria-hidden="true"
          className="absolute inset-0 size-full object-cover"
          onError={handleError}
          onLoad={handleLoad}
          src={src}
        />
      )}
    </span>
  );
}
