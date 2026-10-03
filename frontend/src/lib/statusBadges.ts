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

export function getAppealStatusBadge(status: AppealStatus): BadgeStyle {
  return APPEAL_STATUS_BADGES[status];
}
