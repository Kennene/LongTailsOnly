# ADR 0003: Zegar symulowany (TimeProvider) i sterowanie czasem (Time-Travel)

## Kontekst
Cykl życia dzierżawy trwa od 7 do 90 dni. Podczas prezentacji konkursowej i testów manualnych komisja musi zobaczyć przejście ze stanu aktywnego w stan ostrzeżenia i wygaśnięcia w ciągu kilku sekund.

## Decyzja
1. **Wzorzec `TimeProvider` na backendzie**:
   - Wszystkie moduły backendu (serwis dzierżaw, ewaluator wygasania, rejestr audytu) pobierają aktualny czas wyłącznie przez `time_provider.get_current_time()`.
   - Bezpośrednie wywołania `datetime.now()` w logice domenowej są zabronione.
2. **Sterowanie przesunięciem (Offset / Simulated Time)**:
   - System przechowuje globalny offset czasu w pamięci / bazie (`simulated_offset_seconds`).
   - Endpoint `POST /api/v1/simulation/time-travel` pozwala przesunąć czas o wybraną liczbę dni (np. +7, +25, +35 dni) lub zresetować zegar do czasu rzeczywistego.
3. **Pasek Time-Travel w SPA**:
   - Komponent w nagłówku aplikacji wyświetla bieżący symulowany czas i pozwala jednym kliknięciem wywołać skok w przyszłość, po czym frontend natychmiast odświeża stan dzierżaw.

## Konsekwencje
- Błyskawiczna demonstracja pełnego cyklu życia uprawnień na żywo.
- Brak wpływu na zegar systemowy systemu operacyjnego gospodarza.
