"""The agent loop — the ~60 lines that make it an "agent".

    task ──▶ Claude (with tool schemas) ──▶ stop_reason == "tool_use"? ──▶ run tools ──▶ feed results back ──▶ ... ──▶ final text

Everything else in this package is plumbing. Read this file first.

Notes:
  • The system prompt is sent with cache_control so the rules are billed at 10% after the first call.
  • max_turns bounds cost and runaway loops. A well-behaved run for one claim is 3–6 turns.
  • Every tool call and result is captured in `trace` so you can replay/inspect a run (and write evals against it).
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import anthropic

from cleanbill.agent.tools import Tools

DEFAULT_MODEL = "claude-sonnet-5"
SYSTEM_PROMPT = (Path(__file__).parent / "system_prompt.md").read_text()


@dataclass
class AgentResult:
    final_text: str
    turns: int
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    trace: list[dict] = field(default_factory=list)

    @property
    def cost_usd(self) -> float:  # Sonnet 5 list price; cache reads at 10%
        return (self.input_tokens * 2.0 + self.cache_read_tokens * 0.2 + self.output_tokens * 10.0) / 1e6


def run_agent(task: str, tools: Tools, client: anthropic.Anthropic | None = None, model: str = DEFAULT_MODEL,
              max_turns: int = 12, log=None) -> AgentResult:
    client = client or anthropic.Anthropic()
    messages: list[dict] = [{"role": "user", "content": task}]
    result = AgentResult(final_text="", turns=0)

    for turn in range(1, max_turns + 1):
        resp = client.messages.create(
            model=model, max_tokens=2000,
            system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
            tools=tools.schemas(), messages=messages,
        )
        result.turns = turn
        result.input_tokens += resp.usage.input_tokens
        result.output_tokens += resp.usage.output_tokens
        result.cache_read_tokens += getattr(resp.usage, "cache_read_input_tokens", 0) or 0
        messages.append({"role": "assistant", "content": resp.content})

        if resp.stop_reason != "tool_use":
            result.final_text = "".join(b.text for b in resp.content if b.type == "text")
            return result

        tool_results = []
        for block in resp.content:
            if block.type != "tool_use":
                continue
            out = tools.call(block.name, block.input)
            result.trace.append({"turn": turn, "tool": block.name, "input": block.input, "output": out})
            if log:
                log(f"  [{turn}] {block.name}({json.dumps(block.input)[:120]}) -> {json.dumps(out)[:160]}")
            tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(out, default=str)})
        messages.append({"role": "user", "content": tool_results})

    result.final_text = "(stopped: max_turns reached)"
    return result


def task_for_claim(claim_id: str, status: str) -> str:
    """The per-claim instruction. Short, because the rules live in the system prompt."""
    return (f"Process claim claim_id={claim_id}. Its current status is '{status}'. Load it, do whatever the status "
            f"requires per your rules, leave a draft for the human if one is needed, and finish with a two-line summary: "
            f"what you did, and what the human should do next.")
