<p align="center"><img src="docs/brand/logo-transparent.png" alt="Logo TailCut" width="160" /></p>

# TailCut

> **Żaden dostęp nie jest wieczny.**

TailCut to panel dla osób, które w firmie odpowiadają za bezpieczeństwo. Pilnuje, żeby każdy pracownik miał dostęp tylko do tego, z czego naprawdę korzysta.

Pomyśl o biurze, w którym każdy dostaje klucz do pokoju, kiedy go potrzebuje, ale nikt tych kluczy nigdy nie zbiera. Po kilku latach nie wiadomo, kto może wejść gdzie. TailCut rozwiązuje ten sam problem dla dostępów do kodu programów, na przykład w serwisie GitHub.

Projekt powstał na hackathonie HackYeah 2026 w kategorii Defence.

## Problem

W firmach, które tworzą oprogramowanie, dostęp do kodu daje się „na wszelki wypadek” i nigdy się go nie odbiera.

- **Stare dostępy zostają.** Pracownik zmienia projekt, ale dalej może zmieniać kod w miejscach, do których od dawna nie zagląda.
- **Każdy zbędny dostęp to otwarte drzwi.** Jeśli ktoś włamie się na konto takiej osoby, może szkodzić wszędzie tam, gdzie ona ma dostęp.
- **Nikt nie wie, co jest naprawdę potrzebne.** Ręczne sprawdzanie dostępów jest żmudne, więc robi się je rzadko i pobieżnie.
- **Odbieranie dostępu budzi strach.** Łatwiej niczego nie ruszać, niż przez pomyłkę zablokować komuś pracę.

## Rozwiązanie

W TailCut każdy dostęp działa jak bilet okresowy: jest ważny przez określony czas i trzeba go odnawiać.

## Użycie AI i zasobów zewnętrznych

Pracowaliśmy z asystentami kodu (GitHub Copilot, Claude) w zadaniach weryfikowalnych automatycznie lub w review: testy, schematy, komponenty UI, refaktoryzacja, szkice planów. Architektura, model domeny, kontrakty API, zakres MVP i ADR-y powstały w zespole; decyzje projektowe należały do nas, a zmiany trafiały do `main` po testach i review. Produkt nie korzysta z zewnętrznych modeli AI — mocki GitHuba i Jiry działają lokalnie, a dane demo są syntetyczne. Biblioteki open source i komendy weryfikacyjne opisują [`backend/README.md`](backend/README.md) i [`frontend/README.md`](frontend/README.md).

---

## Dokumentacja
1. **Każdy dostęp ma datę ważności.** Domyślnie 30 dni.
2. **Kto korzysta, nie musi nic robić.** System widzi, że dana osoba pracuje z kodem, i sam przedłuża jej dostęp.
3. **Kto nie korzysta, temu dostęp wygasa.** Jeśli ktoś tylko czyta i komentuje, a niczego nie zmienia, system proponuje mniejszy zakres dostępu zamiast odbierać wszystko.
4. **Nikt nie jest zaskoczony.** Siedem dni przed końcem pojawia się ostrzeżenie. Pracownik może poprosić o przedłużenie i napisać, do czego potrzebuje dostępu.
5. **Decyduje człowiek.** Administrator widzi, jak dostęp był używany, i wybiera: przedłużyć, zmniejszyć albo odebrać.
6. **Wszystko zostaje zapisane.** Kto podjął decyzję, kiedy i dlaczego. Tej historii nie da się zmienić.

Dzięki temu firma na bieżąco wie, które dostępy są potrzebne, a zbędne nie zalegają latami.
