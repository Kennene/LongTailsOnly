from httpx import ASGITransport, AsyncClient

from app.main import app


async def test_health_returns_ok_and_database_is_reachable():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}
