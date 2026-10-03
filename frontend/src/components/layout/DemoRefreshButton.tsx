import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '@/api/client';
import { Button } from '@/components/ui/button';
import { useDemoRefresh } from '@/hooks/useDemoRefresh';
import { formatCountPl, type PolishNounForms } from '@/lib/grouping';
import type { DemoRefreshResult, UserRead } from '@/types/api';

const EVENT_FORMS: PolishNounForms = { one: 'zdarzenie', few: 'zdarzenia', many: 'zdarzeń' };
const NOTHING_NEW_TOAST = 'Brak nowych danych do pobrania';
const REFRESH_ERROR = 'Nie udało się odświeżyć danych demo.';
const REFRESH_DISABLED_ERROR =
  'Odświeżanie demo jest wyłączone na serwerze (ENABLE_DEMO_RESET=false).';

function addedUserMessage(user: UserRead): string {
  const person = `Dodano użytkownika ${user.name} (${user.login})`;

  return user.team === null ? person : `${person} do zespołu ${user.team.name}`;
}

/** Jeden toast na każdą nową osobę i jeden zbiorczy na aktywność — albo wprost, że nic nie przyszło. */
function announce(result: DemoRefreshResult): void {
  for (const user of result.added_users) {
    toast.success(addedUserMessage(user));
  }
  if (result.events.length > 0) {
    toast.success(
      `Nowa aktywność użytkowników: ${formatCountPl(result.events.length, EVENT_FORMS)}`,
    );
  }
  if (result.added_users.length === 0 && result.events.length === 0) {
    toast.info(NOTHING_NEW_TOAST);
  }
}

/**
 * Przycisk wyłącznie na live demo: udaje kolejne pobranie danych z dostawcy
 * (`POST /api/v1/demo/refresh`). Pierwsze kliknięcie przynosi nową osobę, każde następne losową
 * aktywność użytkowników. Wynik ogłasza toast, a widoki odświeża `useDemoRefresh`.
 *
 * Błąd też idzie toastem: pasek górny nie rośnie dla komunikatu (`DESIGN.md` §4), a bez niego
 * nieudane odświeżenie wyglądałoby na zawieszony przycisk.
 */
export function DemoRefreshButton(): React.JSX.Element {
  const refresh = useDemoRefresh();

  function handleClick(): void {
    refresh.mutate(undefined, {
      onSuccess: announce,
      onError: (error: Error): void => {
        // `ENABLE_DEMO_RESET=false` wyłącza także ten endpoint (404), tak jak reset scenariusza.
        const isDisabled = error instanceof ApiError && error.status === 404;

        toast.error(isDisabled ? REFRESH_DISABLED_ERROR : REFRESH_ERROR);
      },
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      title="Demo: symuluje pobranie nowych danych z GitHuba"
      disabled={refresh.isPending}
      aria-busy={refresh.isPending}
      onClick={handleClick}
    >
      <RefreshCw aria-hidden="true" />
      Odśwież dane
    </Button>
  );
}
