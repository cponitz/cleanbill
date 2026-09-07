"""CLI runner for the claims agent.

  python -m trd.agent.run --store fixtures                       # dry run over tests/fixtures/cases.json (needs ANTHROPIC_API_KEY)
  python -m trd.agent.run --store supabase --statuses submitted,needs_dl_update,needs_review,ready_to_submit
  python -m trd.agent.run --store supabase --customer <uuid>

Shadow mode always: the agent drafts and routes; nothing is sent.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date
from pathlib import Path

import anthropic

from trd.agent.loop import DEFAULT_MODEL, run_agent, task_for_claim
from trd.agent.store import FixtureStore, SupabaseStore
from trd.agent.tools import Tools


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--store", choices=["fixtures", "supabase"], default="fixtures")
    ap.add_argument("--fixtures", default=str(Path(__file__).parents[2] / "tests" / "fixtures" / "cases.json"))
    ap.add_argument("--statuses", default="submitted,needs_dl_update,needs_review,ready_to_submit")
    ap.add_argument("--customer", default=None)
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--max-turns", type=int, default=12)
    ap.add_argument("--today", default=None, help="YYYY-MM-DD override for deterministic runs")
    a = ap.parse_args()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY not set", file=sys.stderr); return 2

    store = FixtureStore(a.fixtures) if a.store == "fixtures" else SupabaseStore()
    client = anthropic.Anthropic()
    today = date.fromisoformat(a.today) if a.today else date.today()
    tools = Tools(store, anthropic_client=client, today=today)

    customers = [store.get_claim(a.customer)["customer"]] if a.customer else store.list_customers(a.statuses.split(","))
    total_cost, results = 0.0, []
    for c in customers:
        print(f"\n=== {c['id']}  status={c['status']}  {c['full_name']}")
        r = run_agent(task_for_claim(c["id"], c["status"]), tools, client=client, model=a.model, max_turns=a.max_turns, log=print)
        total_cost += r.cost_usd
        print(f"--- summary ({r.turns} turns, ${r.cost_usd:.4f}):\n{r.final_text}")
        results.append({"customer_id": c["id"], "start_status": c["status"], "turns": r.turns, "cost_usd": r.cost_usd,
                        "final": r.final_text, "trace": r.trace})
    out = Path("data/out"); out.mkdir(parents=True, exist_ok=True)
    (out / "agent_run.json").write_text(json.dumps({"model": a.model, "total_cost_usd": total_cost, "results": results,
                                                     "writes": getattr(store, "writes", None)}, indent=2, default=str))
    print(f"\nTotal: {len(customers)} claims, ${total_cost:.4f}. Trace: data/out/agent_run.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
