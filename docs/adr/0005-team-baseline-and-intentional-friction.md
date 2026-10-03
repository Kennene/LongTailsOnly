# ADR 0005: Wyliczanie standardu zespołu (Team Baseline) i elastyczne decyzje administratora (Intentional Friction)

## Kontekst

Ręczne konfigurowanie dostępów dla każdego nowego członka zespołu jest uciążliwe i sprzyja kopiowaniu uprawnień od innych, co replikuje nadmiarowe uprawnienia. Z kolei proces rozpatrywania wniosków o przedłużenie nie może być bezrefleksyjny, ale musi dawać administratorowi elastyczne narzędzia dopasowane do realiów projektowych (np. długi release, sprint).

## Decyzja

1. **Algorytm wyliczania standardu zespołu (Baseline 50%)**:
   - Repozytorium wchodzi do propozycji standardu zespołu, jeśli w okresie ostatnich 30 dni aktywnie pracowało w nim co najmniej 50% członków tego zespołu (na podstawie unikalnych `user_id` w tabeli `ActivityEvent`).
   - Proponowany poziom dostępu to najniższy wystarczający poziom zarejestrowany dla większości zespołu (`write` lub `read`).
   - Uprawnienie `admin` **nigdy** nie wchodzi do standardu zespołu automatycznie.
2. **Elastyczny wachlarz opcji decyzyjnych dla Administratora**:
   - Podczas review wniosku (lub proaktywnego zarządzania dostępem) administrator ma pełną swobodę wyboru nowego czasu trwania dostępu:
     - **Mnożnik bieżącego okresu**: np. `1.5x` lub `2x` dotychczasowego TTL dostępu.
     - **Presety czasowe**: `+7 dni`, `+14 dni`, `+30 dni`, `+90 dni`.
     - **Czas niestandardowy (Custom)**: wpisanie dowolnej liczby dni lub wybór konkretnej daty w kalendarzu.
   - **Wielokrotność przedłużeń**: Administrator może wydłużać dostęp wielokrotnie przy kolejnych przeglądach (brak sztucznego limitu „jednorazowości”).
3. **Celowe tarcie procesowe przy odwołaniach (Intentional Friction)**:
   - Każde odwołanie użytkownika o przedłużenie wygasającego dostępu wymaga podania nowego, unikalnego uzasadnienia biznesowego.
   - System nie dopuszcza automatycznego odnawiania bez wiedzy i akceptacji administratora.

## Konsekwencje

- Zautomatyzowany, bezpieczny onboarding nowych programistów oparty na faktach telemetrycznych (`ActivityEvent`).
- Administrator posiada pełen zestaw ergonomicznych opcji wydłużania dostępu (mnożniki, presety, custom) przy zachowaniu ścisłej rozliczalności audytowej.
