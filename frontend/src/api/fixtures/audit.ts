import type { AuditLogRead } from '@/types/api';

/**
 * Fixture'y w kształcie kontraktu (`frontend/src/types/api.ts`, generowanego z Pydantic).
 *
 * Trzymamy je jako literały TS z jawnym typem, a nie jako pliki `.json`: dzięki temu brak pola,
 * literówka w nazwie albo literał spoza unii (`ActorType`) jest **błędem kompilacji**, a nie
 * pustą kolumną na demo. Gdy Osoba 6 dostarczy surowe JSON-y (krok 6.1), opakowujemy je tutaj
 * tym samym typem.
 *
 * Kolejność jest ta, którą oddaje backend: **najnowsze zdarzenia pierwsze**, a `id` rośnie
 * z czasem. `SYSTEM` nie ma człowieka, więc jego `actor_id` to `null`; `details` jest obiektem
 * (np. `{ days: 30 }`), który tabela pokazuje jako zwięzły podgląd, nie surowy JSON.
 */
export const auditFixture: AuditLogRead[] = [
  {
    id: 7,
    timestamp: '2026-10-03T05:15:00Z',
    actor_type: 'ADMIN',
    actor_id: 1,
    action: 'baseline.approve',
    target: 'teams/dev',
    details: { user_login: 'nowy-dev', entries: 4 },
    justification: 'Nowy członek DEV wchodzi ze standardem zespołu: cztery repozytoria.',
  },
  {
    id: 6,
    timestamp: '2026-10-02T21:00:00Z',
    actor_type: 'SYSTEM',
    actor_id: null,
    action: 'lease.warn',
    target: 'longtails/frontend-app#marta',
    details: { days_remaining: 5 },
    justification: null,
  },
  {
    id: 5,
    timestamp: '2026-10-02T07:40:00Z',
    actor_type: 'ADMIN',
    actor_id: 1,
    action: 'lease.revoke',
    target: 'longtails/legacy-reports#piotr',
    details: { role: 'write' },
    justification:
      'Dostęp zapisujący do legacy-reports był potrzebny wyłącznie do jednorazowej migracji danych na nowy magazyn raportów; po zakończeniu prac uprawnienie zostaje odebrane, a zespół pracuje dalej na odczycie.',
  },
  {
    id: 4,
    timestamp: '2026-10-01T18:05:00Z',
    actor_type: 'ADMIN',
    actor_id: 1,
    action: 'appeal.decide',
    target: 'appeal#1',
    details: { decision: 'APPROVED', multiplier: 2 },
    justification: 'Zespół QA potwierdził, że Marta nadal prowadzi wydanie.',
  },
  {
    id: 3,
    timestamp: '2026-10-01T16:20:00Z',
    actor_type: 'USER',
    actor_id: 3,
    action: 'appeal.submit',
    target: 'lease#2',
    details: { lease_id: 2 },
    justification:
      'Prowadzę release v2.1 w przyszłym tygodniu i potrzebuję zapisu do frontend-app.',
  },
  {
    id: 2,
    timestamp: '2026-09-30T09:45:00Z',
    actor_type: 'ADMIN',
    actor_id: 1,
    action: 'lease.grant',
    target: 'longtails/frontend-app#kamil',
    details: { role: 'write', days: 30 },
    justification: 'Kamil dołącza do zespołu DEV i od pierwszego dnia pracuje nad płatnościami.',
  },
  {
    id: 1,
    timestamp: '2026-09-28T08:12:00Z',
    actor_type: 'SYSTEM',
    actor_id: null,
    action: 'lease.extend',
    target: 'longtails/core-api#marta',
    details: { days: 30 },
    justification: null,
  },
];
