import asyncio


def test_generate_artifact_direct_parses_json(monkeypatch):
    import main as api

    async def fake_call_groq(*_args, **_kwargs) -> str:
        return '{"ok": true, "artifact": "marketing_strategy"}'

    monkeypatch.setenv("GROQ_API_KEY", "gsk_test")
    monkeypatch.setattr(api, "_call_groq", fake_call_groq)

    result = asyncio.run(
        api._generate_artifact_direct(
            artifact_type="marketing_strategy",
            company_name="Acme Corp",
            company_url="https://example.com",
            profile={},
            inputs={"geo": "India"},
        )
    )

    assert result == {"ok": True, "artifact": "marketing_strategy"}


def test_generate_artifact_direct_unknown_artifact(monkeypatch):
    import main as api

    monkeypatch.setenv("GROQ_API_KEY", "gsk_test")

    try:
        asyncio.run(
            api._generate_artifact_direct(
                artifact_type="definitely_not_real",
                company_name="Acme Corp",
                company_url=None,
                profile={},
                inputs={},
            )
        )
    except ValueError as e:
        assert "Unknown artifact type" in str(e)
    else:
        raise AssertionError("Expected ValueError for unknown artifact type")
