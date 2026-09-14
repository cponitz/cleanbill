"""Loop mechanics + tool handlers, tested WITHOUT calling the API (a scripted fake client plays Claude)."""
from datetime import date
from pathlib import Path
from types import SimpleNamespace

from trd.agent.loop import run_agent, task_for_claim
from trd.agent.store import FixtureStore
from trd.agent.tools import Tools

FIX = Path(__file__).parent / "fixtures" / "cases.json"
TODAY = date(2026, 9, 7)


class Block(SimpleNamespace):
    pass


class FakeClient:
    """Plays a scripted sequence of assistant turns. Each script item is a list of blocks."""

    def __init__(self, script):
        self.script = list(script)
        self.calls = []
        self.messages = self

    def create(self, **kw):
        self.calls.append({**kw, "messages": list(kw["messages"])})  # snapshot: the loop mutates its list after the call
        blocks = self.script.pop(0)
        stop = "tool_use" if any(b.type == "tool_use" for b in blocks) else "end_turn"
        return SimpleNamespace(content=blocks, stop_reason=stop, usage=SimpleNamespace(input_tokens=100, output_tokens=20, cache_read_input_tokens=0))


def tu(id_, name, inp):
    return Block(type="tool_use", id=id_, name=name, input=inp)


def test_tools_happy_path_end_to_end_without_llm():
    store = FixtureStore(FIX)
    t = Tools(store, anthropic_client=None, today=TODAY)
    claim = t.call("get_claim", {"claim_id": "cust-1"})
    assert claim["property"]["situs_full"].startswith("3675 DUVAL")
    assert claim["claim"]["id"] == "cust-1" and claim["customer"]["id"] == "acct-1" and claim["claim"]["customer_id"] == "acct-1"   # v2 shape
    assert claim["documents"][0]["extracted"]["dl_number"] == "***2728"  # masked
    v = t.call("validate_against_roll", {"claim_id": "cust-1"})
    assert v["status"] == "ready_to_submit"
    pk = t.call("generate_form_50114", {"claim_id": "cust-1", "over65": False})
    assert pk["bytes"] > 500 and len(pk["sha256"]) == 64
    assert t.call("set_status", {"claim_id": "cust-1", "status": "processing", "reason": "x"})["ok"]
    assert t.call("set_status", {"claim_id": "cust-1", "status": "ready_to_submit", "reason": "validated"})["ok"]
    assert [f["code"] for f in store.data["claims"][0]["findings"]] == ["address_match", "name_match"]   # structured findings stored with the status
    d = t.call("draft_message", {"claim_id": "cust-1", "intent": "ready_to_submit", "subject": "Ready", "body": "Hi Richard, your packet is ready."})
    assert d["message_id"].startswith("msg-")


def test_tools_refuse_false_claims_in_drafts():
    t = Tools(FixtureStore(FIX), today=TODAY)
    d = t.call("draft_message", {"claim_id": "cust-1", "intent": "filed", "subject": "x", "body": "Good news, we have submitted your application."})
    assert "error" in d


def test_tools_block_illegal_transitions():
    t = Tools(FixtureStore(FIX), today=TODAY)
    r = t.call("set_status", {"claim_id": "cust-5", "status": "needs_dl_update", "reason": "nope"})  # ready_to_submit -> needs_dl_update not allowed
    assert "error" in r


def test_mismatch_case_routes_to_dl_update():
    t = Tools(FixtureStore(FIX), today=TODAY)
    v = t.call("validate_against_roll", {"claim_id": "cust-2"})
    assert v["status"] == "needs_dl_update" and v["address_match"] is False


def test_loop_feeds_tool_results_back_and_stops_on_text():
    store = FixtureStore(FIX)
    tools = Tools(store, today=TODAY)
    script = [
        [tu("a", "get_claim", {"claim_id": "cust-2"})],
        [tu("b", "validate_against_roll", {"claim_id": "cust-2"}), tu("c", "set_status", {"claim_id": "cust-2", "status": "processing", "reason": "start"})],
        [tu("d", "set_status", {"claim_id": "cust-2", "status": "needs_dl_update", "reason": "ID address 900 Congress Ave != situs"}),
         tu("e", "draft_message", {"claim_id": "cust-2", "intent": "needs_dl_update", "subject": "One quick step", "body": "Hi Richard, the address on your ID doesn't match. You can also file free at traviscad.org."})],
        [Block(type="text", text="Routed to needs_dl_update; drafted DPS-update email.\nHuman: approve the draft.")],
    ]
    client = FakeClient(script)
    r = run_agent(task_for_claim("cust-2", "submitted"), tools, client=client, model="fake", max_turns=6)
    assert r.turns == 4 and "needs_dl_update" in r.final_text
    assert [x["tool"] for x in r.trace] == ["get_claim", "validate_against_roll", "set_status", "set_status", "draft_message"]
    # the second API call must carry the tool_result for tool_use id "a"
    second = client.calls[1]["messages"]
    assert second[-1]["role"] == "user" and second[-1]["content"][0]["tool_use_id"] == "a"
    # system prompt is cached
    assert client.calls[0]["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert store.data["claims"][1]["status"] == "needs_dl_update"


def test_loop_stops_at_max_turns():
    tools = Tools(FixtureStore(FIX), today=TODAY)
    client = FakeClient([[tu(str(i), "get_claim", {"claim_id": "cust-1"})] for i in range(10)])
    r = run_agent("loop forever", tools, client=client, model="fake", max_turns=3)
    assert r.turns == 3 and "max_turns" in r.final_text
