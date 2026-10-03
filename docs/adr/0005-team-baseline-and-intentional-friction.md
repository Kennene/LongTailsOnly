# ADR 0005: Wyliczanie standardu zespołu (Team Baseline) i celowe tarcie (Intentional Friction)

## Kontekst
Ręczne konfigurowanie dostępów dla każdego nowego członka zespołu jest uciążliwe i sprzyja kopiowaniu uprawnień od innych, co replikuje nadmiarowe uprawnienia. Z kolei odnawianie dostępów nie może być bezrefleksyjnym kliknięciem "OK" dla wszystkich.

## Decyzja
1. **Algorytm wyliczania standardu zespołu (Baseline 50%)**:
   - Repozytorium wchodzi do propozycji standardu zespołu, jeśli w okresie ostatnich 30 dni aktywnie pracowało w nim co najmniej 50% członków tego zespołu.
   - Proponowany poziom dostępu to najniższy wystarczający poziom zarejestrowany dla większości zespołu (zazwyczaj `push`/write lub `triage`).
   - Uprawnienie `admin` **nigdy** nie wchodzi do standardu zespołu automatycznie.
2. **Celowe tarcie procesowe przy odwołaniach (Intentional Friction)**:
   - Użytkownik proszący o przedłużenie wygasającego dostępu musi podać nowe, tekstowe uzasadnienie biznesowe.
   - System nie pozwala na automatyczne odnowienie na podstawie historycznych odwołań ani kopiowanie szablonów bez zatwierdzenia przez administratora.
   - W przypadku rzadkich zadań administrator może jednorazowo przyznać dłuższy okres dzierżawy (np. 90 dni).

## Konsekwencje
- Zautomatyzowany, bezpieczny onboarding nowych programistów oparty na faktach, a nie domysłach.
- Świadome podejmowanie decyzji o przedłużaniu dzierżaw bez powstawania martwych dostępów.
