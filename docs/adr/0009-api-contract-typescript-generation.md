# ADR 0009: Kontrakt API — Pydantic jako źródło prawdy, typy TS generowane

**Status:** Proponowany (do akceptacji zespołu) · **Autor:** Kocik (Osoba 1) · **Data:** 2026-10-03
**Doprecyzowuje:** ADR 0001 pkt 3 („schematy Pydantic ↔ interfejsy TypeScript”)

## Kontekst

ADR 0001 wymaga, by interfejsy TypeScript odpowiadały schematom Pydantic, ale nie mówi jak. Ręczne przepisywanie typów na hackathonie gwarantuje rozjazdy (literówka w nazwie pola = pusta kolumna w tabeli na demo). Frontend jeszcze nie istnieje, a endpointy powstają równolegle, więc OpenAPI (`/openapi.json`) nie zawiera jeszcze wszystkich schematów.

## Decyzja

1. **Źródłem prawdy są schematy Pydantic** w `backend/app/schemas/` i enumy w `backend/app/domain/`.
2. **Skrypt `backend/scripts/export_contract.py`** zbiera wszystkie schematy z `app.schemas.CONTRACT_MODELS` do jednego pliku JSON Schema: `backend/contract/schema.json`.
3. **Typy TS generujemy** z tego pliku narzędziem `json-schema-to-typescript` (przez `npx`, bez dodawania zależności do backendu) do `frontend/src/types/api.ts`. Pliku nie edytuje się ręcznie (nagłówek „AUTO-GENERATED”).
4. **Test `tests/schemas/test_contract_is_fresh.py`** porównuje zawartość `contract/schema.json` z aktualnymi schematami — CI zaświeci na czerwono, jeśli ktoś zmieni schemat i nie wygeneruje kontraktu.
5. Polecenie dla zespołu (opisane w `backend/README.md`):
   ```bash
   cd backend && uv run python scripts/export_contract.py
   npx --yes json-schema-to-typescript@15 -i contract/schema.json -o ../frontend/src/types/api.ts --unreachableDefinitions
   ```

## Konsekwencje

- Front i back używają identycznych nazw pól i wartości enumów.
- Wymaga Node.js do generowania typów (i tak potrzebny frontendowi).
- Odrzucone: ręcznie pisane typy TS (rozjazdy), `openapi-typescript` (wymaga podłączonych endpointów, których jeszcze nie ma).
