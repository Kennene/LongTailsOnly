# AGENTS.md

Ten plik instruuje agentów AI, **jak pracować** w tym repozytorium oraz **gdzie zapisywać** plany i specyfikacje.

## Metodologia pracy

W tym projekcie obowiązuje metodologia **Superpowers**:
- **brainstorming** przed pisaniem kodu: doprecyzowanie wymagań, architektury i decyzji projektowych.
- **writing-plans**: podział pracy na małe, weryfikowalne kroki (2–5 min). Plany zapisujemy w `docs/superpowers/plans/`.
- **test-driven-development (TDD)**: cykl Red-Green-Refactor, testy pisane przed kodem produkcyjnym.
- **verification-before-completion**: weryfikacja faktami i dowodami, a nie deklaracjami.

Katalog i opis dostępnych skilli znajduje się w pliku `SKILLS.md`.

## Struktura dokumentacji i artefaktów

| Ścieżka | Zawartość |
| --- | --- |
| `AGENTS.md` | Główny przewodnik dla agentów i zasady pracy. |
| `SKILLS.md` | Rejestr skilli agentowych w `.agents/skills/`. |
| `docs/superpowers/specs/` | Specyfikacje architektoniczne i projektowe. |
| `docs/superpowers/plans/` | Plany realizacji zadań. |

## Zasady

- **Zawsze sprawdzaj skille przed rozpoczęciem zadania.** Używaj narzędzia `skill` / komendy `/nazwa`.
- **Kod i dokumentacja muszą być spójne.**
- **Dowody ponad deklaracje:** przed zakończeniem zadania uruchom testy / lintery i przedstaw realne wyniki.
