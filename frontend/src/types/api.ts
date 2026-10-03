/* AUTO-GENERATED from backend/contract/schema.json - do not edit. Regenerate: see backend/README.md */

/**
 * This interface was referenced by `LongTailsOnlyAPIContract`'s JSON-Schema
 * via the `definition` "ActionType".
 */
export type ActionType =
  "PushEvent" | "PullRequestReviewEvent" | "IssueCommentEvent" | "PullRequestEvent" | "IssuesEvent" | "PublicEvent";
/**
 * This interface was referenced by `LongTailsOnlyAPIContract`'s JSON-Schema
 * via the `definition` "Role".
 */
export type Role = "read" | "write" | "admin";
/**
 * This interface was referenced by `LongTailsOnlyAPIContract`'s JSON-Schema
 * via the `definition` "ActorType".
 */
export type ActorType = "ADMIN" | "USER" | "SYSTEM";
/**
 * This interface was referenced by `LongTailsOnlyAPIContract`'s JSON-Schema
 * via the `definition` "AppealStatus".
 */
export type AppealStatus = "PENDING" | "APPROVED" | "REJECTED";
/**
 * This interface was referenced by `LongTailsOnlyAPIContract`'s JSON-Schema
 * via the `definition` "DecisionAction".
 */
export type DecisionAction = "EXTEND" | "DOWNSCOPE" | "REVOKE";
/**
 * This interface was referenced by `LongTailsOnlyAPIContract`'s JSON-Schema
 * via the `definition` "Recommendation".
 */
export type Recommendation = "KEEP" | "DOWNSCOPE" | "REVOKE";
/**
 * This interface was referenced by `LongTailsOnlyAPIContract`'s JSON-Schema
 * via the `definition` "LeaseStatus".
 */
export type LeaseStatus = "ACTIVE" | "WARNING" | "EXPIRED";

export interface LongTailsOnlyAPIContract {
  [k: string]: unknown;
}
/**
 * This interface was referenced by `LongTailsOnlyAPIContract`'s JSON-Schema
 * via the `definition` "ActivityEventRead".
 */
export interface ActivityEventRead {
  action_type: ActionType;
  id: number;
  repo_id: number;
  required_permission: Role;
  timestamp: string;
  user_id: number;
}
/**
 * This interface was referenced by `LongTailsOnlyAPIContract`'s JSON-Schema
 * via the `definition` "AppealCreate".
 */
export interface AppealCreate {
  justification: string;
  lease_id: number;
}
/**
 * This interface was referenced by `LongTailsOnlyAPIContract`'s JSON-Schema
 * via the `definition` "AppealRead".
 */
export interface AppealRead {
  created_at: string;
  id: number;
  justification: string;
  lease_id: number;
  repo_id: number;
  requested_role: Role;
  resolved_at: string | null;
  status: AppealStatus;
  user_id: number;
}
/**
 * This interface was referenced by `LongTailsOnlyAPIContract`'s JSON-Schema
 * via the `definition` "AuditLogRead".
 */
export interface AuditLogRead {
  action: string;
  actor_id: number | null;
  actor_type: ActorType;
  details: {
    [k: string]: unknown;
  };
  id: number;
  justification: string | null;
  target: string;
  timestamp: string;
}
/**
 * This interface was referenced by `LongTailsOnlyAPIContract`'s JSON-Schema
 * via the `definition` "BaselineEntry".
 */
export interface BaselineEntry {
  active_members: number;
  proposed_role: Role;
  repository: RepositoryRead;
  team_id: number;
  team_size: number;
}
/**
 * This interface was referenced by `LongTailsOnlyAPIContract`'s JSON-Schema
 * via the `definition` "RepositoryRead".
 */
export interface RepositoryRead {
  default_branch: string;
  default_lease_duration_days: number;
  id: number;
  name: string;
  owner: string;
}
/**
 * This interface was referenced by `LongTailsOnlyAPIContract`'s JSON-Schema
 * via the `definition` "ClockRead".
 */
export interface ClockRead {
  now: string;
  offset_days: number;
}
/**
 * This interface was referenced by `LongTailsOnlyAPIContract`'s JSON-Schema
 * via the `definition` "DecisionRequest".
 */
export interface DecisionRequest {
  action: DecisionAction;
  extension?: Extension | null;
  justification?: string | null;
}
/**
 * Exactly one way of extending a lease (ADR 0005).
 *
 * This interface was referenced by `LongTailsOnlyAPIContract`'s JSON-Schema
 * via the `definition` "Extension".
 */
export interface Extension {
  custom_days?: number | null;
  multiplier?: (1.5 | 2) | null;
  preset_days?: (7 | 14 | 30 | 90) | null;
  until_date?: string | null;
}
/**
 * This interface was referenced by `LongTailsOnlyAPIContract`'s JSON-Schema
 * via the `definition` "DemoResetResult".
 */
export interface DemoResetResult {
  counts: {
    [k: string]: number;
  };
  now: string;
  offset_days: number;
}
/**
 * Lease plus values computed by the lease service (Task 8 of the team plan).
 *
 * This interface was referenced by `LongTailsOnlyAPIContract`'s JSON-Schema
 * via the `definition` "LeaseOverview".
 */
export interface LeaseOverview {
  current_role: Role;
  days_remaining: number | null;
  expires_at: string | null;
  granted_at: string;
  id: number;
  is_active: boolean;
  last_activity_at: string | null;
  recommendation: Recommendation;
  repository: RepositoryRead;
  status: LeaseStatus;
  user: UserRead;
}
/**
 * This interface was referenced by `LongTailsOnlyAPIContract`'s JSON-Schema
 * via the `definition` "UserRead".
 */
export interface UserRead {
  id: number;
  is_admin: boolean;
  login: string;
  name: string;
  team: TeamRead | null;
}
/**
 * This interface was referenced by `LongTailsOnlyAPIContract`'s JSON-Schema
 * via the `definition` "TeamRead".
 */
export interface TeamRead {
  id: number;
  name: string;
  slug: string;
}
/**
 * This interface was referenced by `LongTailsOnlyAPIContract`'s JSON-Schema
 * via the `definition` "LeaseRead".
 */
export interface LeaseRead {
  current_role: Role;
  expires_at: string | null;
  granted_at: string;
  id: number;
  is_active: boolean;
  repository: RepositoryRead;
  user: UserRead;
}
/**
 * This interface was referenced by `LongTailsOnlyAPIContract`'s JSON-Schema
 * via the `definition` "TimeTravelRequest".
 */
export interface TimeTravelRequest {
  days: number;
}
