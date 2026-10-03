# ADR 0003: Zegar symulowany (TimeProvider) i sterowanie czasem (Time-Travel)

## Kontekst

Cykl życia dzierżawy trwa od kilku dni do kilku miesięcy. Podczas prezentacji konkursowej i testów manualnych komisja musi zobaczyć przejście ze stanu aktywnego w stan ostrzeżenia i wygaśnięcia w ciągu kilku sekund. Ponadto administrator powinien mieć pełną kontrolę nad czasem trwania dzierżawy (TTL).

## Decyzja

1. **Wzorzec `TimeProvider` na backendzie**:
   - Wszystkie moduły backendu (serwis dzierżaw, ewaluator wygasania, rejestr audytu) pobierają aktualny czas wyłącznie przez port `time_provider.now()`.
   - Bezpośrednie wywołania `datetime.now()` w logice domenowej są zabronione.
2. **Sterowanie przesunięciem (Offset / Simulated Time)**:
   - System przechowuje globalny offset czasu w pamięci / bazie (`simulated_offset_seconds`).
   - Endpoint `POST /api/v1/simulation/time-travel` pozwala przesunąć czas o wybraną liczbę dni (np. +7, +25, +35 dni) lub zresetować zegar do czasu rzeczywistego.
3. **Konfigurowalny bazowy TTL przez Administratora**:
   - Administrator w panelu może zdefiniować domyślny czas trwania dzierżawy (np. 14, 30, 90 dni) globalnie dla organizacji lub per repozytorium.
   - Wszelkie operacje przedłużeń dzierżawy oraz kalkulacje mnożników (np. przedłużenie o `2x`) są obliczane deterministycznie w odniesieniu do czasu symulowanego `time_provider.now()`.
4. **Pasek Time-Travel w SPA**:
   - Komponent w nagłówku aplikacji wyświetla bieżący symulowany czas i pozwala jednym kliknięciem wywołać skok w przyszłość, po czym frontend natychmiast odświeża stan dzierżaw.

## Konsekwencje

- Błyskawiczna demonstracja pełnego cyklu życia uprawnień na żywo.
- Brak wpływu na zegar systemowy systemu operacyjnego gospodarza.
- Pełna swoboda konfiguracji parametrów czasowych przez administratora bezpieczeństwa.
