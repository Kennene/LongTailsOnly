"""Dashboard counters and React Flow graph (ADR 0014 §4): ready to render, nothing computed in the browser."""

from datetime import datetime
from typing import Self

from pydantic import BaseModel

from app.domain.enums import LeaseStatus, Recommendation, Role
from app.domain.insights import EdgeKind, GraphLayout, NodeKind

ANIMATED_STATUSES = frozenset({LeaseStatus.WARNING, LeaseStatus.EXPIRED})


class DashboardStats(BaseModel):
    generated_at: datetime
    active: int
    warning: int
    expired: int
    permanent: int
    revoked: int
    downscope_recommendations: int
    revoke_recommendations: int
    pending_appeals: int
    onboarding_candidates: int


class GraphPosition(BaseModel):
    x: int
    y: int


class GraphNodeData(BaseModel):
    label: str
    team: str | None
    is_admin: bool


class GraphNode(BaseModel):
    id: str
    type: NodeKind
    position: GraphPosition
    data: GraphNodeData


class GraphEdgeData(BaseModel):
    kind: EdgeKind
    role: Role | None
    status: LeaseStatus | None
    recommendation: Recommendation | None


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    label: str | None
    animated: bool
    data: GraphEdgeData


class PermissionGraph(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]

    @classmethod
    def from_layout(cls, layout: GraphLayout) -> Self:
        return cls(
            nodes=[GraphNode(id=n.id, type=n.kind, position=GraphPosition(x=n.x, y=n.y),
                             data=GraphNodeData(label=n.label, team=n.team, is_admin=n.is_admin))
                   for n in layout.nodes],
            edges=[GraphEdge(id=e.id, source=e.source, target=e.target,
                             label=e.role.value if e.role is not None else None,
                             animated=e.status in ANIMATED_STATUSES,
                             data=GraphEdgeData(kind=e.kind, role=e.role, status=e.status,
                                                recommendation=e.recommendation))
                   for e in layout.edges],
        )
