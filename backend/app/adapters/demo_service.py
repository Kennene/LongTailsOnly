"""Demonstracyjna zaślepka usługi typu issue tracker — to nie jest integracja.

Moduł nie wykonuje żadnych operacji i nie przechowuje własnych danych. Deklaruje swój
deskryptor i publikuje go przez publiczne API rejestru, dzięki czemu warstwa API czyta
katalog usług, zamiast zaszytej listy.

Katalog jest jednak obsługiwany z wpisów wbudowanych rejestru, więc samo zgłoszenie jest
dziś **sprawdzonym no-opem**: nic nie zmienia, dopóki wpis `_BUILTIN` istnieje, a przy
rozjeździe deskryptorów kończy się głośnym `ValueError` już przy imporcie. Ten moduł
istnieje po to, by szew wtyczkowy był prawdziwą ścieżką rejestracji, gdy wpis wbudowany
zostanie wycofany.

Wpis `demo-tracker` jest niedostępny (`is_available=False`), więc UI pokazuje go jako
pozycję wyłączoną. Deskryptor musi pozostać identyczny z wpisem `_BUILTIN` w
`app/ports/service_registry.py`.
"""

from app.ports.service_registry import ServiceDescriptor, ServiceKind, register

DEMO_TRACKER_DESCRIPTOR: ServiceDescriptor = ServiceDescriptor(
    id="demo-tracker",
    name="Demo Tracker (integracja demonstracyjna)",
    kind=ServiceKind.ISSUE_TRACKER,
    capabilities=("dashboard", "audit"),
    is_available=False,
)

register(DEMO_TRACKER_DESCRIPTOR)
