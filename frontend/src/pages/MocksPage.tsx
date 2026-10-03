import { type MockSystem, MockSystemCard } from '@/components/mocks/MockSystemCard';
import { TimeTravelBar } from '@/components/mocks/TimeTravelBar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const CLOCK_HEADING_ID = 'mocks-clock-heading';

/** Grupy odpowiadają tagom w Swaggerze mocków (`backend/app/api/mock_docs.py`). */
const MOCK_SYSTEMS: readonly MockSystem[] = [
  {
    name: 'GitHub',
    description: 'Udaje GitHub REST API v3 organizacji longtails.',
    basePath: '/api/v3',
    groups: ['Organizacja i repozytoria', 'Dostęp do repozytoriów', 'Zdarzenia'],
  },
  {
    name: 'Jira',
    description: 'Udaje Jira Cloud REST API v3: projekty 1:1 z repozytoriami.',
    basePath: '/rest/api/3',
    groups: ['Projekty', 'Role projektowe', 'Użytkownicy i grupy', 'Zgłoszenia', 'Audyt'],
  },
];

/**
 * Widok `/mocks`: wszystko, co w demo udaje świat zewnętrzny — zegar symulowany z resetem
 * scenariusza oraz opis mocków GitHuba i Jiry. Trzymane osobno, żeby nie zaśmiecać górnego paska.
 */
export function MocksPage(): React.JSX.Element {
  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Mocki</h1>
        <p className="text-sm text-muted-foreground">
          Sterowanie demo i udawane systemy zewnętrzne. Nic stąd nie dotyka prawdziwego GitHuba ani
          Jiry.
        </p>
      </header>

      <Card role="region" aria-labelledby={CLOCK_HEADING_ID}>
        <CardHeader>
          <CardTitle id={CLOCK_HEADING_ID}>Czas symulowany</CardTitle>
          <CardDescription>
            Przesuń zegar, żeby zobaczyć wygasanie dostępów. Reset przywraca dane startowe demo.
          </CardDescription>
        </CardHeader>
        <CardContent className="max-w-md">
          <TimeTravelBar />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {MOCK_SYSTEMS.map((system: MockSystem): React.JSX.Element => (
          <MockSystemCard key={system.name} system={system} />
        ))}
      </div>
    </section>
  );
}
