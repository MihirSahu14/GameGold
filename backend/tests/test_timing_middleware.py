"""TimingMiddleware — measurement only, logs method/path/duration for every request."""
import logging


def test_request_logs_method_path_and_duration_ms(client, caplog):
    with caplog.at_level(logging.INFO, logger="app.perf"):
        resp = client.get("/health")

    assert resp.status_code == 200
    records = [r for r in caplog.records if r.name == "app.perf"]
    assert len(records) == 1
    message = records[0].getMessage()
    assert "method=GET" in message
    assert "path=/health" in message
    assert "duration_ms=" in message
