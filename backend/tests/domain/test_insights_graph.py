from app.domain.enums import LeaseStatus, Recommendation, Role
from app.domain.insights import LayoutEdge, LeaseSnapshot, MemberSnapshot, build_graph_layout

MEMBERS = [
    MemberSnapshot("tomasz-admin", None, None, True),
    MemberSnapshot("marta", "qa", "QA", False),
    MemberSnapshot("kamil", "dev", "DEV", False),
    MemberSnapshot("ania", "dev", "DEV", False),
]
REPOS = ["qa-automation", "core-api", "payment-service", "docs-portal"]
LEASES = [
    LeaseSnapshot(1, "tomasz-admin", "core-api", Role.ADMIN, True, None, None),
    LeaseSnapshot(2, "kamil", "payment-service", Role.WRITE, True, LeaseStatus.WARNING, Recommendation.DOWNSCOPE),
    LeaseSnapshot(3, "marta", "qa-automation", Role.READ, True, LeaseStatus.ACTIVE, Recommendation.KEEP),
    LeaseSnapshot(4, "kamil", "core-api", Role.WRITE, False, LeaseStatus.EXPIRED, Recommendation.REVOKE),
]


def test_full_graph_layout_and_ids() -> None:
    layout = build_graph_layout(MEMBERS, REPOS, LEASES)

    assert [(node.id, node.x, node.y) for node in layout.nodes] == [
        ("team:dev", 0, 0), ("team:qa", 0, 80),
        ("user:ania", 320, 0), ("user:kamil", 320, 80), ("user:marta", 320, 160), ("user:tomasz-admin", 320, 240),
        ("repo:core-api", 640, 0), ("repo:docs-portal", 640, 80), ("repo:payment-service", 640, 160),
        ("repo:qa-automation", 640, 240),
    ]
    team = layout.nodes[0]
    admin = layout.nodes[5]
    assert (team.kind, team.label, team.team) == ("team", "DEV", "dev")
    assert (admin.kind, admin.label, admin.team, admin.is_admin) == ("user", "tomasz-admin", None, True)
    assert [edge.id for edge in layout.edges] == [
        "member:ania", "member:kamil", "member:marta", "lease:1", "lease:2", "lease:3"]
    assert layout.edges[0] == LayoutEdge("member:ania", "team:dev", "user:ania", "membership")
    assert layout.edges[4] == LayoutEdge("lease:2", "user:kamil", "repo:payment-service", "lease", Role.WRITE,
                                         LeaseStatus.WARNING, Recommendation.DOWNSCOPE)


def test_team_filter_keeps_only_members_and_their_repos() -> None:
    layout = build_graph_layout(MEMBERS, REPOS, LEASES, team="qa")

    assert [node.id for node in layout.nodes] == ["team:qa", "user:marta", "repo:qa-automation"]
    assert [edge.id for edge in layout.edges] == ["member:marta", "lease:3"]


def test_every_edge_points_to_an_existing_node() -> None:
    layout = build_graph_layout(MEMBERS, [], LEASES)
    node_ids = {node.id for node in layout.nodes}

    assert layout.edges
    assert all(edge.source in node_ids and edge.target in node_ids for edge in layout.edges)


def test_empty_input_gives_empty_graph() -> None:
    layout = build_graph_layout([], [], [])

    assert (layout.nodes, layout.edges) == ([], [])
