# ADR 0002: Model dzierżawy dostępu (Access Lease) i hierarchia uprawnień

## Kontekst
Głównym problemem bezpieczeństwa jest pełzanie uprawnień (privilege creep) i bezterminowy dostęp administracyjny. Każde uprawnienie powinno wygasać, jeśli nie jest aktywnie wykorzystywane. Jednocześnie proste operacje (np. `git push`) nie powinny odnawiać uprawnień poziomu `admin`.

## Decyzja
1. **Dzierżawa zamiast stałych uprawnień (ZSP)**:
   - Każde przypisanie uprawnienia ma postać dzierżawy (`Lease`) z datą wygaśnięcia `expires_at`.
   - Domyślny okres dzierżawy wynosi **30 dni**. Okno ostrzegawcze wynosi **7 dni**.
2. **Hierarchia uprawnień GitHub i asymetryczne odnawianie**:
   - Hierarchia: `admin` (5) > `maintain` (4) > `push` (3, write) > `triage` (2) > `pull` (1, read).
   - Akcja o wymaganym poziomie L_req odnawia wyłącznie uprawnienia na poziomie <= L_req.
   - Jeśli użytkownik posiada rolę `admin`, lecz wykonuje wyłącznie akcje poziomu `push`, data wygaśnięcia poziomu `admin` nie przesuwa się.
3. **Deeskalacja (Down-scoping)**:
   - Po wygaśnięciu poziomu wyższego, jeśli poziom niższy był aktywnie używany, system proponuje deeskalację (np. degradację z `admin` do `push`) zamiast całkowitego odcięcia użytkownika od projektu.

## Konsekwencje
- Wyeliminowanie nieużywanych uprawnień administracyjnych bez przerywania codziennej pracy deweloperskiej.
- Konieczność mapowania zdarzeń z mocka GitHuba (`PushEvent`, `MemberEvent`, `IssuesEvent`) na minimalne poziomy uprawnień.
