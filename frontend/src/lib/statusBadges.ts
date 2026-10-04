import {
  ArrowDownCircle,
  Ban,
  CheckCircle2,
  CircleCheck,
  CircleX,
  Clock,
  Eye,
  type LucideIcon,
  Pencil,
  Shield,
  ShieldOff,
} from 'lucide-react';

import type { AppealStatus, LeaseStatus, Recommendation, Role } from '@/types/api';

/**
 * Pigułka stanu wraz z ikoną. Ikona i jej slug mieszkają tutaj, a nie w komponencie, bo
 * `DESIGN.md` §1 i §4 wyznacza ten plik na **jedyne** mapowanie stan → kształt i kolor; ikona
 * jest częścią kształtu. `LeaseStatusBadge`, `RecommendationBadge` i `RoleBadge` tylko je składają,
 * więc tabela i modal nie mogą się rozjechać.
 */
export interface BadgeStyle {
  label: string;
  className: string;
  icon: LucideIcon;
  /**
   * Nazwa ikony dokładnie tak, jak lucide wypisuje ją w `class` (`lucide-<slug>`). Trzymamy ją
   * jawnie, bo `icon.name` bywa zminifikowane, a `displayName` zależy od build'a pakietu — testy
   * i style muszą mieć stabilny kontrakt z DOM-em.
   */
  slug: string;
}

/** Etykieta + ikona bez koloru; kolor dokłada konkretna mapa poniżej. */
type BadgeMeta = Omit<BadgeStyle, 'className'> & { colour: string };

/**
 * Ikony niosą **rangę**, nie dekorację: `Clock` mówi „termin ucieka”, `Ban` jest jedyną akcją
 * nieodwracalną, a `Shield`/`ShieldOff` trzymają razem parę break-glass. `CircleCheck`
 * i `CheckCircle2` są świadomie różne — status mówi, czym dostęp *jest*, rekomendacja, co *zrobić*.
 */
const STATUS_META: Record<LeaseStatus, BadgeMeta> = {
  ACTIVE: {
    label: 'Aktywny',
    colour: 'border-status-active-border bg-status-active-subtle text-status-active',
    icon: CircleCheck,
    slug: 'circle-check',
  },
  WARNING: {
    label: 'Wygasa wkrótce',
    colour: 'border-status-warning-border bg-status-warning-subtle text-status-warning',
    icon: Clock,
    slug: 'clock',
  },
  EXPIRED: {
    label: 'Wygasł',
    colour: 'border-status-expired-border bg-status-expired-subtle text-status-expired',
    icon: CircleX,
    slug: 'circle-x',
  },
  // Admin (break-glass) i odebrany dostęp nie czekają na decyzję, więc zostają neutralne (jak `KEEP`).
  PERMANENT: {
    label: 'Stały (admin)',
    colour: 'border-border bg-muted text-muted-foreground',
    icon: Shield,
    slug: 'shield',
  },
  REVOKED: {
    label: 'Odebrany',
    colour: 'border-border bg-muted text-muted-foreground line-through',
    icon: ShieldOff,
    slug: 'shield-off',
  },
};

/**
 * Poziom ma własne rodziny `role-*`, a nie `status-*`: to cecha dostępu, nie jego stan, więc
 * barwy (odczyt niebieski, zapis różowy, admin pomarańczowy) omijają kolory stanów i `--primary`.
 */
const ROLE_META: Record<Role, BadgeMeta> = {
  admin: {
    label: 'Administrator',
    colour: 'border-role-admin-border bg-role-admin-subtle text-role-admin',
    icon: Shield,
    slug: 'shield',
  },
  write: {
    label: 'Zapis (write)',
    colour: 'border-role-write-border bg-role-write-subtle text-role-write',
    icon: Pencil,
    slug: 'pencil',
  },
  read: {
    label: 'Odczyt (read)',
    colour: 'border-role-read-border bg-role-read-subtle text-role-read',
    icon: Eye,
    slug: 'eye',
  },
};

const RECOMMENDATION_META: Record<Recommendation, BadgeMeta> = {
  KEEP: {
    label: 'Bez zmian',
    colour: 'border-border bg-muted text-muted-foreground',
    icon: CheckCircle2,
    slug: 'check-circle-2',
  },
  DOWNSCOPE: {
    label: 'Zdeeskaluj',
    colour: 'border-status-downscope-border bg-status-downscope-subtle text-status-downscope',
    icon: ArrowDownCircle,
    slug: 'arrow-down-circle',
  },
  REVOKE: {
    label: 'Odbierz',
    colour: 'border-status-revoke-border bg-status-revoke-subtle text-status-revoke',
    icon: Ban,
    slug: 'ban',
  },
};

const APPEAL_STATUS_META: Record<AppealStatus, BadgeMeta> = {
  PENDING: {
    label: 'Oczekujące',
    colour: 'border-status-warning-border bg-status-warning-subtle text-status-warning',
    icon: Clock,
    slug: 'clock',
  },
  APPROVED: {
    label: 'Zatwierdzone',
    colour: 'border-status-active-border bg-status-active-subtle text-status-active',
    icon: CircleCheck,
    slug: 'circle-check',
  },
  REJECTED: {
    label: 'Odrzucone',
    colour: 'border-status-expired-border bg-status-expired-subtle text-status-expired',
    icon: CircleX,
    slug: 'circle-x',
  },
};

/** Rozdziela `colour` od reszty, żeby `BadgeStyle` nie niósł dwóch nazw na to samo. */
function toBadge(meta: BadgeMeta): BadgeStyle {
  const { colour, ...badge }: BadgeMeta = meta;

  return { ...badge, className: colour };
}

export function getStatusBadge(status: LeaseStatus): BadgeStyle {
  return toBadge(STATUS_META[status]);
}

export function getRoleLabel(role: Role): string {
  return ROLE_META[role].label;
}

/**
 * Tekst „Po terminie X dni” w tabeli dostępów — termin minął, więc niesie go rodzina krytyczna
 * (`status-expired`), jak odznakę „Wygasł”. Klasa mieszka tutaj, bo tylko ten plik nazywa `status-*`.
 */
export const OVERDUE_TEXT_CLASS = 'font-medium text-status-expired-foreground';

/**
 * Wiek ostatniej aktywności przy **wygasłym** dostępie: dawno (poza oknem aktywności) — czerwień,
 * niedawno — zieleń, bo to dowód, że dostęp jest jeszcze używany. Przy pozostałych dostępach wiek
 * zostaje neutralny, żeby kolor nie przekrzykiwał statusu.
 */
export const ACTIVITY_STALE_TEXT_CLASS = 'text-status-expired-foreground';
export const ACTIVITY_RECENT_TEXT_CLASS = 'text-status-active-foreground';

export function getRoleBadge(role: Role): BadgeStyle {
  return toBadge(ROLE_META[role]);
}

export function getRecommendationLabel(recommendation: Recommendation): string {
  return RECOMMENDATION_META[recommendation].label;
}

export function getRecommendationBadge(recommendation: Recommendation): BadgeStyle {
  return toBadge(RECOMMENDATION_META[recommendation]);
}

export function getAppealStatusBadge(status: AppealStatus): BadgeStyle {
  return toBadge(APPEAL_STATUS_META[status]);
}
