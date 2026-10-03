"""Demonstracyjny zaślepek usługi typu issue tracker — to nie jest integracja.

Moduł nie wykonuje żadnych operacji i nie przechowuje własnych danych. Istnieje po to,
by katalog usług i bramkowanie widoków per usługa działały na prawdziwym wpisie
zarejestrowanym przez adapter, a nie na liście zaszytej w warstwie API.

Wpis `demo-tracker` jest niedostępny (`is_available=False`), więc UI pokazuje go jako
pozycję wyłączoną. Deskryptor musi być identyczny z wpisem `_BUILTIN` w
`app/ports/service_registry.py`; `register` podnosi `ValueError` już przy imporcie, gdy
wartości się rozjadą, więc rozjazd jest głośnym błędem startu, a nie cichą różnicą.
"""

from app.ports.service_registry import ServiceDescriptor, ServiceKind, register

DEMO_TRACKER_DESCRIPTOR = ServiceDescriptor(
    id="demo-tracker",
    name="Demo Tracker (integracja demonstracyjna)",
    kind=ServiceKind.ISSUE_TRACKER,
    capabilities=("dashboard", "audit"),
    is_available=False,
)

register(DEMO_TRACKER_DESCRIPTOR)
