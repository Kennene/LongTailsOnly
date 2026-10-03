<!-- Szablon PR. Lista kontrolna jest wymagana przez ADR 0013. -->

## Co zmienia ten PR

<!-- Jedno lub dwa zdania. Jeśli PR realizuje krok z planu zespołowego, podaj numer (np. 3.6). -->

Krok planu: <!-- np. 3.6 / nie dotyczy -->

## Jak to zweryfikowano

<!-- Podaj komendę i jej wynik. Dowody, nie deklaracje. -->

```
np. cd backend && .venv\Scripts\python.exe -m pytest -q   ->  73 passed
```

## Lista kontrolna

- [ ] Sprawdziłem/am wpływ na ADR-y: dotyczy numer(y) <!-- 0002, 0007 --> / nie dotyczy
- [ ] Nie naruszam żadnej obowiązującej decyzji **lub** wskazałem nowy ADR w tym PR
- [ ] Jeśli zmieniłem schematy Pydantic lub enumy, wygenerowałem kontrakt i typy TS (ADR 0009)
- [ ] Jeśli zmieniłem modele ORM, dodałem migrację Alembic i uruchomiłem `tests/db/test_migrations.py`
- [ ] Testy przechodzą lokalnie (podaję komendę i wynik wyżej)
- [ ] Żaden nowy plik nie przekracza 300 linii (`CODING_STANDARDS.md` §1.1)
- [ ] Decyzje z tego PR wysłane do Prelinta, jeśli są trwałe

## Uwagi dla recenzenta

<!-- Na co patrzeć, co jest świadomie poza zakresem, gdzie są kompromisy. -->
