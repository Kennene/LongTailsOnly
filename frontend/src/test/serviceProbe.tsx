/**
 * Wspólne sondy wyboru usługi. Kontrolka (`ServicePicker`) nie zna `data-testid="active-service"`,
 * więc test, który chce **obserwować efekt** wyboru, musi mieć w drzewie komponent czytający ten sam
 * kontekst — dokładnie te sondy. Powstały w zadaniu 7 (Ruling 24), a nie w 6, bo dopiero picker
 * daje na nie realne zapotrzebowanie; lokalne kopie w `ServicesContext.test.tsx` zostają.
 */
import { useActiveService } from '@/services/ServicesContext';

/** Bieżąca usługa bez własnego UI — goły identyfikator, `''` gdy nic nie jest aktywne. */
export function ActiveServiceProbe(): React.JSX.Element {
  const { activeService } = useActiveService();

  return <span data-testid="active-service">{activeService.id}</span>;
}

/** Sonda z zaszytym celem: działa także wtedy, gdy katalog jest pusty, w drodze albo martwy. */
export function ServiceSwitcherProbe(): React.JSX.Element {
  const { activeService, setActiveService } = useActiveService();

  return (
    <div>
      <span data-testid="active-service">{activeService.id}</span>
      <button type="button" onClick={() => setActiveService('demo-tracker')}>
        Przełącz na demo-tracker
      </button>
    </div>
  );
}
