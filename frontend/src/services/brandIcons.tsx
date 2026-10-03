/**
 * Znaki firmowe dostawców, których `lucide-react` nie dostarcza — wersja 1.51 usunęła ikony
 * marek (`Github` i `Gitlab` nie istnieją w pakiecie). Oba SVG są monochromatyczne:
 * `fill="currentColor"` dziedziczy kolor tokenu, a `aria-hidden` trzyma je poza drzewem
 * dostępności — nazwę usługi niesie tekst obok ikony.
 *
 * Wyjątek od „ikony wyłącznie z `lucide-react`” (`frontend/DESIGN.md` §6) jest świadomy
 * i opisany w `docs/superpowers/specs/2026-10-03-service-picker-design.md` §5.1. Oba
 * komponenty spełniają kontrakt `ServiceIconComponent`, co kompilator sprawdza przy
 * przypisaniu w rejestrze usług.
 */
interface BrandIconProps {
  className?: string;
}

export function GitHubIcon({ className }: BrandIconProps): React.JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

/**
 * Uproszczony, jednokolorowy lisek: dwa czworokąty (uszy) schodzące się w dolny czubek.
 * Świadomie nie odtwarzamy oficjalnego, wielotonowego logo — na `size-4` liczy się
 * rozpoznawalny, odrębny zarys, nie wierność znakowi.
 */
export function GitLabIcon({ className }: BrandIconProps): React.JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <polygon points="12,21.5 1.5,12 4.8,2.5 12,9.5" />
      <polygon points="12,21.5 12,9.5 19.2,2.5 22.5,12" />
    </svg>
  );
}
