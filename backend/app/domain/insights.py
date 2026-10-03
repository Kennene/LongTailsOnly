"""Ready-made view data (ADR 0010 §5.9-5.10): dashboard counters and the permission graph layout.

Pure functions: the service passes in lease and member snapshots, the browser computes nothing.
"""

from collections import Counter
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Literal

from app.domain.enums import LeaseStatus, Recommendation, Role

NodeKind = Literal["team", "user", "repo"]
EdgeKind = Literal["membership", "lease"]
COLUMN_X: dict[NodeKind, int] = {"team": 0, "user": 320, "repo": 640}
ROW_HEIGHT = 80


@dataclass(frozen=True)
class LeaseSnapshot:
    lease_id: int
    login: str
    repo: str
    role: Role
    is_active: bool
    status: LeaseStatus | None
    recommendation: Recommendation | None


@dataclass(frozen=True)
class MemberSnapshot:
    login: str
    team_slug: str | None
    team_name: str | None
    is_admin: bool


@dataclass(frozen=True)
class DashboardCounters:
    active: int
    warning: int
    expired: int
    permanent: int
    revoked: int
    downscope_recommendations: int
    revoke_recommendations: int
    pending_appeals: int
    onboarding_candidates: int


def compute_dashboard_counters(
    leases: Sequence[LeaseSnapshot], members: Iterable[MemberSnapshot], pending_appeals: int
) -> DashboardCounters:
    live = [lease for lease in leases if lease.is_active]
    leased = [lease for lease in live if lease.role is not Role.ADMIN]
    statuses = Counter(lease.status for lease in leased)
    recommendations = Counter(lease.recommendation for lease in leased)
    with_access = {lease.login for lease in live}
    return DashboardCounters(
        active=statuses[LeaseStatus.ACTIVE],
        warning=statuses[LeaseStatus.WARNING],
        expired=statuses[LeaseStatus.EXPIRED],
        permanent=len(live) - len(leased),
        revoked=len(leases) - len(live),
        downscope_recommendations=recommendations[Recommendation.DOWNSCOPE],
        revoke_recommendations=recommendations[Recommendation.REVOKE],
        pending_appeals=pending_appeals,
        onboarding_candidates=sum(1 for member in members if member.team_slug is not None
                                  and not member.is_admin and member.login not in with_access),
    )


@dataclass(frozen=True)
class LayoutNode:
    id: str
    kind: NodeKind
    label: str
    x: int
    y: int
    team: str | None = None
    is_admin: bool = False


@dataclass(frozen=True)
class LayoutEdge:
    id: str
    source: str
    target: str
    kind: EdgeKind
    role: Role | None = None
    status: LeaseStatus | None = None
    recommendation: Recommendation | None = None


@dataclass(frozen=True)
class GraphLayout:
    nodes: list[LayoutNode]
    edges: list[LayoutEdge]


def build_graph_layout(members: Sequence[MemberSnapshot], repos: Iterable[str], leases: Sequence[LeaseSnapshot],
                       team: str | None = None) -> GraphLayout:
    users = sorted((m for m in members if team is None or m.team_slug == team),
                   key=lambda m: (m.team_slug is None, m.team_slug or "", m.login))
    logins = {member.login for member in users}
    live = sorted((lease for lease in leases if lease.is_active and lease.login in logins),
                  key=lambda lease: lease.lease_id)
    repo_names = sorted((set(repos) if team is None else set()) | {lease.repo for lease in live})
    teams = sorted({(m.team_slug, m.team_name or m.team_slug) for m in users if m.team_slug is not None})
    nodes = [
        *(_node("team", f"team:{slug}", name, row, team=slug) for row, (slug, name) in enumerate(teams)),
        *(_node("user", f"user:{m.login}", m.login, row, team=m.team_slug, is_admin=m.is_admin)
          for row, m in enumerate(users)),
        *(_node("repo", f"repo:{name}", name, row) for row, name in enumerate(repo_names)),
    ]
    edges = [
        *(LayoutEdge(f"member:{m.login}", f"team:{m.team_slug}", f"user:{m.login}", "membership")
          for m in users if m.team_slug is not None),
        *(LayoutEdge(f"lease:{lease.lease_id}", f"user:{lease.login}", f"repo:{lease.repo}", "lease", lease.role,
                     lease.status, lease.recommendation) for lease in live),
    ]
    return GraphLayout(nodes=nodes, edges=edges)


def _node(kind: NodeKind, node_id: str, label: str, row: int, *, team: str | None = None,
          is_admin: bool = False) -> LayoutNode:
    return LayoutNode(id=node_id, kind=kind, label=label, x=COLUMN_X[kind], y=row * ROW_HEIGHT, team=team,
                      is_admin=is_admin)
