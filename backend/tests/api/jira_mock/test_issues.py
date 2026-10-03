import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import ActionType
from app.domain.jira_events import issue_key
from tests.api.jira_mock.conftest import API, acc, add_event

CREATED, UPDATED = ActionType.JIRA_ISSUE_CREATED, ActionType.JIRA_ISSUE_UPDATED
COMMENT, PROJECT = ActionType.JIRA_COMMENT_CREATED, ActionType.JIRA_PROJECT_UPDATED


async def seed_issue(db: AsyncSession) -> str:
    """Three consecutive events = one issue: created by dev-01, updated by dev-01, commented by dev-02."""
    first = await add_event(db, "dev-01", "PAY", CREATED, 6)
    await add_event(db, "dev-01", "PAY", UPDATED, 4)
    await add_event(db, "dev-02", "PAY", COMMENT, 2)
    return issue_key("PAY", first.id, first.id)


async def search(client: httpx.AsyncClient, jql: str, **params: object) -> httpx.Response:
    return await client.get(f"{API}/search/jql", params={"jql": jql, **params})


async def test_search_returns_issue_with_fields_on_request(client: httpx.AsyncClient, db: AsyncSession) -> None:
    key = await seed_issue(db)
    body = (await search(client, "project = PAY AND updated >= -30d", fields="*all")).json()
    assert body["isLast"] is True and "nextPageToken" not in body
    assert [i["key"] for i in body["issues"]] == [key]
    fields = body["issues"][0]["fields"]
    assert fields["status"]["name"] == "In Progress" and fields["project"]["key"] == "PAY"
    assert fields["reporter"]["accountId"] == acc("dev-01") and fields["assignee"]["accountId"] == acc("dev-01")
    assert fields["updated"] == "2026-10-01T12:00:00.000+0000"
    bare = (await search(client, "project = PAY")).json()["issues"][0]
    assert bare.get("fields") is None and {"id", "key", "self"} <= bare.keys()


async def test_search_filters_by_project_actor_and_window(client: httpx.AsyncClient, db: AsyncSession) -> None:
    key = await seed_issue(db)
    await add_event(db, "qa-01", "QA", UPDATED, 40)
    assert [i["key"] for i in (await search(client, "project = QA AND updated >= -30d")).json()["issues"]] == []
    assert len((await search(client, "project = QA AND updated >= -60d")).json()["issues"]) == 1
    commenter = (await search(client, f'commenter = "{acc("dev-02")}" AND updated >= -30d')).json()["issues"]
    assert [i["key"] for i in commenter] == [key]
    assert (await search(client, f'commenter = "{acc("dev-01")}" AND updated >= -30d')).json()["issues"] == []
    reporter = (await search(client, f'reporter = "{acc("dev-01")}" AND project = PAY')).json()["issues"]
    assert [i["key"] for i in reporter] == [key]


async def test_search_orders_pages_with_token(client: httpx.AsyncClient, db: AsyncSession) -> None:
    for age in (9, 5, 1):  # three separate issues (ids 3 apart)
        await add_event(db, "dev-01", "PAY", UPDATED, age)
        await add_event(db, "dev-01", "PAY", COMMENT, age - 0.5)
        await add_event(db, "dev-01", "PAY", COMMENT, age - 0.4)
    first = (await search(client, "project = PAY", maxResults=2)).json()
    assert len(first["issues"]) == 2 and first["isLast"] is False
    second = (await search(client, "project = PAY", maxResults=2, nextPageToken=first["nextPageToken"])).json()
    assert len(second["issues"]) == 1 and second["isLast"] is True
    newest_first = [i["key"] for i in first["issues"] + second["issues"]]
    asc = (await search(client, "project = PAY ORDER BY updated ASC")).json()["issues"]
    assert [i["key"] for i in asc] == newest_first[::-1]
    assert (await search(client, "project = PAY", nextPageToken="x")).status_code == 400


async def test_bad_jql_is_400_in_jira_format(client: httpx.AsyncClient) -> None:
    unbounded = await search(client, "order by updated DESC")
    assert unbounded.status_code == 400
    assert "Unbounded JQL" in unbounded.json()["errorMessages"][0] and unbounded.json()["errors"] == {}
    assert (await search(client, "status = Done")).status_code == 400


async def test_issue_changelog_and_comments(client: httpx.AsyncClient, db: AsyncSession) -> None:
    key = await seed_issue(db)
    issue = (await client.get(f"{API}/issue/{key}")).json()
    assert issue["key"] == key and issue["fields"]["summary"] == f"Issue {key}"
    log = (await client.get(f"{API}/issue/{key}/changelog")).json()
    assert log["total"] == 1
    entry = log["values"][0]
    assert entry["author"]["accountId"] == acc("dev-01")
    assert entry["items"][0]["field"] == "status" and entry["items"][0]["fromString"] != entry["items"][0]["toString"]
    comments = (await client.get(f"{API}/issue/{key}/comment")).json()
    assert comments["total"] == 1 and comments["comments"][0]["author"]["accountId"] == acc("dev-02")
    assert comments["comments"][0]["body"]["type"] == "doc"
    assert (await client.get(f"{API}/issue/PAY-999")).status_code == 404
    assert (await client.get(f"{API}/issue/{key}/changelog", params={"maxResults": 0})).json()["values"] == []


async def test_future_events_are_hidden_and_time_travel_moves_window(client: httpx.AsyncClient, db: AsyncSession, clock) -> None:
    await add_event(db, "dev-01", "PAY", UPDATED, -1)  # tomorrow
    assert (await search(client, "project = PAY")).json()["issues"] == []
    await add_event(db, "dev-01", "PAY", UPDATED, 10)
    assert len((await search(client, "project = PAY AND updated >= -30d")).json()["issues"]) == 1
    clock.advance(25)  # the 10-day-old update is now 35 days old; the "tomorrow" one is 24 days old
    assert len((await search(client, "project = PAY AND updated >= -30d")).json()["issues"]) == 1
    clock.advance(10)
    assert (await search(client, "project = PAY AND updated >= -30d")).json()["issues"] == []


async def test_github_events_never_appear_as_jira_issues(client: httpx.AsyncClient, db: AsyncSession) -> None:
    await add_event(db, "dev-01", "PAY", ActionType.PUSH, 1)  # wrong provider type on a Jira project: ignored
    assert (await search(client, "project = PAY")).json()["issues"] == []


async def test_audit_records_list_project_updates_only(client: httpx.AsyncClient, db: AsyncSession) -> None:
    await seed_issue(db)
    await add_event(db, "tomasz-admin", "PAY", PROJECT, 12)
    await add_event(db, "tomasz-admin", "QA", PROJECT, 3)
    body = (await client.get(f"{API}/auditing/record")).json()
    assert body["total"] == 2 and [r["objectItem"]["name"] for r in body["records"]] == ["QA", "PAY"]
    assert body["records"][0]["authorAccountId"] == acc("tomasz-admin")
    window = (await client.get(f"{API}/auditing/record", params={"from": "2026-09-25T00:00:00"})).json()
    assert window["total"] == 1 and window["records"][0]["objectItem"]["name"] == "QA"
    assert (await client.get(f"{API}/auditing/record", params={"from": "garbage"})).status_code == 400
    paged = (await client.get(f"{API}/auditing/record", params={"offset": 1, "limit": 1})).json()
    assert paged["total"] == 2 and len(paged["records"]) == 1
