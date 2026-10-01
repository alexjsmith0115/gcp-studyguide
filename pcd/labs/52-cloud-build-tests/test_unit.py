"""Unit tests: no network and no Redis. A fake client takes the place of Redis."""
import pytest

import main


class FakeRedis:
    """Implements the one Redis command that the app uses."""

    def __init__(self):
        self.data = {}

    def incr(self, key, amount=1):
        self.data[key] = self.data.get(key, 0) + amount
        return self.data[key]


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(main, "redis_client", FakeRedis())
    return main.app.test_client()


def test_increment_counts_up(client):
    assert client.post("/counters/home").get_json() == {"name": "home", "count": 1}
    assert client.post("/counters/home").get_json()["count"] == 2


def test_invalid_name_returns_400(client):
    assert client.post("/counters/Not_Valid").status_code == 400


def test_counter_key():
    assert main.counter_key("home") == "counter:home"
    with pytest.raises(ValueError):
        main.counter_key("UPPER")
