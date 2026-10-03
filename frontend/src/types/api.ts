/* AUTO-GENERATED from backend/contract/schema.json - do not edit. Regenerate: see backend/README.md */

/**
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
 * via the `definition` "ActionType".
 */
export type ActionType =
  | "PushEvent"
  | "PullRequestReviewEvent"
  | "IssueCommentEvent"
  | "PullRequestEvent"
  | "IssuesEvent"
  | "PublicEvent"
  | "jira:issue_created"
  | "jira:issue_updated"
  | "comment_created"
  | "project_updated";
/**
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
 * via the `definition` "Role".
 */
export type Role = "read" | "write" | "admin";
/**
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
 * via the `definition` "ActorType".
 */
export type ActorType = "ADMIN" | "USER" | "SYSTEM";
/**
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
 * via the `definition` "AppealStatus".
 */
export type AppealStatus = "PENDING" | "APPROVED" | "REJECTED";
/**
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
 * via the `definition` "DecisionAction".
 */
export type DecisionAction = "EXTEND" | "DOWNSCOPE" | "REVOKE";
/**
 * How the lease engine acts on lapsing leases (docs/3-silnik-dzierzawy §5).
 *
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
 * via the `definition` "EnforcementMode".
 */
export type EnforcementMode = "disabled" | "warning" | "auto";
/**
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
 * via the `definition` "Recommendation".
 */
export type Recommendation = "KEEP" | "DOWNSCOPE" | "REVOKE";
/**
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
 * via the `definition` "LeaseStatus".
 */
export type LeaseStatus = "ACTIVE" | "WARNING" | "EXPIRED" | "PERMANENT" | "REVOKED";
/**
 * The class of external system a service represents.
 *
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
 * via the `definition` "ServiceKind".
 */
export type ServiceKind = "vcs" | "issue_tracker" | "cloud_iam";

export interface TailCutAPIContract {
  [k: string]: unknown;
}
/**
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
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
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
 * via the `definition` "AppealCreate".
 */
export interface AppealCreate {
  justification: string;
  lease_id: number;
}
/**
 * Appeal with everything the admin needs to decide, computed by the backend (UC-3, ADR 0014 §4).
 *
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
 * via the `definition` "AppealOverview".
 */
export interface AppealOverview {
  created_at: string;
  days_remaining: number | null;
  id: number;
  justification: string;
  lease_expires_at: string | null;
  lease_id: number;
  lease_is_active: boolean;
  lease_role: Role;
  previous_appeals: number;
  recent_activity_count: number;
  repo_id: number;
  repository: RepositoryRead;
  requested_role: Role;
  resolved_at: string | null;
  status: AppealStatus;
  user: UserRead;
  user_id: number;
}
/**
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
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
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
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
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
 * via the `definition` "TeamRead".
 */
export interface TeamRead {
  id: number;
  name: string;
  slug: string;
}
/**
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
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
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
 * via the `definition` "AppealRejectRequest".
 */
export interface AppealRejectRequest {
  justification: string;
}
/**
 * Audit row with the actor's login resolved, so the UI does not join users itself (ADR 0014 §4).
 *
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
 * via the `definition` "AuditEntry".
 */
export interface AuditEntry {
  action: string;
  actor_id: number | null;
  actor_login: string | null;
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
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
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
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
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
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
 * via the `definition` "ClockRead".
 */
export interface ClockRead {
  now: string;
  offset_days: number;
}
/**
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
 * via the `definition` "DashboardStats".
 */
export interface DashboardStats {
  active: number;
  downscope_recommendations: number;
  expired: number;
  expired_window_days: number;
  generated_at: string;
  onboarding_candidates: number;
  pending_appeals: number;
  permanent: number;
  revoke_recommendations: number;
  revoked: number;
  warning: number;
}
/**
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
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
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
 * via the `definition` "Extension".
 */
export interface Extension {
  custom_days?: number | null;
  multiplier?: (1.5 | 2) | null;
  preset_days?: (7 | 14 | 30 | 90) | null;
  until_date?: string | null;
}
/**
 * One demo "refresh": the first call finds a new person, every later one brings fresh activity instead.
 *
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
 * via the `definition` "DemoRefreshResult".
 */
export interface DemoRefreshResult {
  added_users: UserRead[];
  events: ActivityEventRead[];
}
/**
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
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
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
 * via the `definition` "EnforcementModeRead".
 */
export interface EnforcementModeRead {
  mode: EnforcementMode;
}
/**
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
 * via the `definition` "EnforcementModeUpdate".
 */
export interface EnforcementModeUpdate {
  mode: EnforcementMode;
}
/**
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
 * via the `definition` "GraphEdge".
 */
export interface GraphEdge {
  animated: boolean;
  data: GraphEdgeData;
  id: string;
  label: string | null;
  source: string;
  target: string;
}
/**
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
 * via the `definition` "GraphEdgeData".
 */
export interface GraphEdgeData {
  kind: "membership" | "lease";
  recommendation: Recommendation | null;
  role: Role | null;
  status: LeaseStatus | null;
}
/**
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
 * via the `definition` "GraphNode".
 */
export interface GraphNode {
  data: GraphNodeData;
  id: string;
  position: GraphPosition;
  type: "team" | "user" | "repo";
}
/**
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
 * via the `definition` "GraphNodeData".
 */
export interface GraphNodeData {
  is_admin: boolean;
  label: string;
  team: string | null;
}
/**
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
 * via the `definition` "GraphPosition".
 */
export interface GraphPosition {
  x: number;
  y: number;
}
/**
 * Evidence of use for the decision modal: renewing actions in the lease window (docs/3-silnik-dzierzawy §6).
 *
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
 * via the `definition` "LeaseActivityStats".
 */
export interface LeaseActivityStats {
  comment_count: number;
  last_activity_at: string | null;
  lease_id: number;
  push_count: number;
  review_count: number;
  window_days: number;
  window_end: string;
  window_start: string;
}
/**
 * Lease plus values computed by the lease service (Task 8 of the team plan).
 *
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
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
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
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
 * Team baseline split for one person: what approval would grant and what they already have (ADR 0014 §4).
 *
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
 * via the `definition` "OnboardingProposal".
 */
export interface OnboardingProposal {
  already_granted: BaselineEntry[];
  team: TeamRead;
  to_grant: BaselineEntry[];
  user: UserRead;
}
/**
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
 * via the `definition` "PermissionGraph".
 */
export interface PermissionGraph {
  edges: GraphEdge[];
  nodes: GraphNode[];
}
/**
 * One selectable external service: its identity, what it can do and whether it is usable.
 *
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
 * via the `definition` "ServiceRead".
 */
export interface ServiceRead {
  capabilities: string[];
  id: string;
  is_available: boolean;
  kind: ServiceKind;
  name: string;
}
/**
 * Which demo day the panel is on: simulated UTC time and how many days we travelled (ADR 0003, ADR 0014 §4).
 *
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
 * via the `definition` "SimulationClock".
 */
export interface SimulationClock {
  offset_days: number;
  simulated_now: string;
}
/**
 * This interface was referenced by `TailCutAPIContract`'s JSON-Schema
 * via the `definition` "TimeTravelRequest".
 */
export interface TimeTravelRequest {
  days: number;
}
