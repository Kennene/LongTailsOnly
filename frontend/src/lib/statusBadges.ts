import type { AppealStatus, LeaseStatus, Recommendation, Role } from '@/types/api';

export interface BadgeStyle {
  label: string;
  className: string;
}

const STATUS_BADGES: Record<LeaseStatus, BadgeStyle> = {
  ACTIVE: {
    label: 'Aktywna',
    className: 'border-status-active-border bg-status-active-subtle text-status-active',
  },
  WARNING: {
    label: 'Wygasa wkrótce',
    className: 'border-status-warning-border bg-status-warning-subtle text-status-warning',
  },
  EXPIRED: {
    label: 'Wygasła',
    className: 'border-status-expired-border bg-status-expired-subtle text-status-expired',
  },
};

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  write: 'Zapis (write)',
  read: 'Odczyt (read)',
};

const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  KEEP: 'Bez zmian',
  DOWNSCOPE: 'Zdeeskaluj',
  REVOKE: 'Odbierz',
};

/**
 * Rekomendacje jako pigułki (DESIGN.md §1 i §4): `KEEP` zostaje neutralne (brak koloru jest
 * sygnałem), `DOWNSCOPE` bierze rodzinę doradczą, a `REVOKE` rodzinę krytyczną (`status-revoke`
 * to alias `status-expired`). Etykiety pochodzą z `RECOMMENDATION_LABELS`, więc tabela i modal
 * nie mogą się rozjechać.
 */
const RECOMMENDATION_BADGES: Record<Recommendation, BadgeStyle> = {
  KEEP: {
    label: RECOMMENDATION_LABELS.KEEP,
    className: 'border-border bg-muted text-muted-foreground',
  },
  DOWNSCOPE: {
    label: RECOMMENDATION_LABELS.DOWNSCOPE,
    className: 'border-status-downscope-border bg-status-downscope-subtle text-status-downscope',
  },
  REVOKE: {
    label: RECOMMENDATION_LABELS.REVOKE,
    className: 'border-status-revoke-border bg-status-revoke-subtle text-status-revoke',
  },
};

const APPEAL_STATUS_BADGES: Record<AppealStatus, BadgeStyle> = {
  PENDING: {
    label: 'Oczekujące',
    className: 'border-status-warning-border bg-status-warning-subtle text-status-warning',
  },
  APPROVED: {
    label: 'Zatwierdzone',
    className: 'border-status-active-border bg-status-active-subtle text-status-active',
  },
  REJECTED: {
    label: 'Odrzucone',
    className: 'border-status-expired-border bg-status-expired-subtle text-status-expired',
  },
};

export function getStatusBadge(status: LeaseStatus): BadgeStyle {
  return STATUS_BADGES[status];
}

export function getRoleLabel(role: Role): string {
  return ROLE_LABELS[role];
}

export function getRecommendationLabel(recommendation: Recommendation): string {
  return RECOMMENDATION_LABELS[recommendation];
}

export function getRecommendationBadge(recommendation: Recommendation): BadgeStyle {
  return RECOMMENDATION_BADGES[recommendation];
}

export function getAppealStatusBadge(status: AppealStatus): BadgeStyle {
  return APPEAL_STATUS_BADGES[status];
}
