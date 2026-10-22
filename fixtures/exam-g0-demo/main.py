"""Demo artifact for the G0 exam (Study Hub). One API request with structured output.

Runs against the Anthropic Messages API. Set ANTHROPIC_API_KEY before running.
The point of the exercise: get JSON that matches a schema, validate it on the client,
retry when the answer is invalid or truncated, and print the usage block for the cost note.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request

API_URL = "https://api.anthropic.com/v1/messages"
MODEL = "claude-haiku-5-5"
MAX_TOKENS = 300          # hard cap on the answer; a truncated answer shows up as stop_reason == "max_tokens"
MAX_ATTEMPTS = 3          # retry budget for invalid or truncated answers

# JSON schema for structured output: the model must answer with exactly this shape.
SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["city", "country", "population_millions"],
    "properties": {
        "city": {"type": "string"},
        "country": {"type": "string"},
        "population_millions": {"type": "number"},
    },
}


def validate(obj: object) -> list[str]:
    """Client-side validation against SCHEMA (a minimal validator, no external library)."""
    errors: list[str] = []
    if not isinstance(obj, dict):
        return ["answer is not an object"]
    for key in SCHEMA["required"]:
        if key not in obj:
            errors.append(f"missing field: {key}")
    for key, spec in SCHEMA["properties"].items():
        if key in obj:
            want = {"string": str, "number": (int, float)}[spec["type"]]
            if not isinstance(obj[key], want) or isinstance(obj[key], bool):
                errors.append(f"wrong type for {key}: expected {spec['type']}")
    for key in obj:
        if key not in SCHEMA["properties"]:
            errors.append(f"unexpected field: {key}")
    return errors


def call_api(question: str) -> dict:
    body = {
        "model": MODEL,
        "max_tokens": MAX_TOKENS,
        "stop_sequences": ["\n\n"],
        "system": "Answer only with a JSON object that matches this JSON schema, no prose: " + json.dumps(SCHEMA),
        "messages": [{"role": "user", "content": question}],
    }
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(body).encode(),
        headers={
            "content-type": "application/json",
            "x-api-key": os.environ["ANTHROPIC_API_KEY"],
            "anthropic-version": "2023-06-01",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def ask(question: str) -> dict:
    for attempt in range(1, MAX_ATTEMPTS + 1):
        resp = call_api(question)
        stop_reason = resp.get("stop_reason")
        text = "".join(block.get("text", "") for block in resp.get("content", []))
        print(f"attempt {attempt}: stop_reason={stop_reason} usage={json.dumps(resp.get('usage'))}", file=sys.stderr)
        if stop_reason == "max_tokens":
            # truncated answer: the JSON is almost surely cut, retry instead of parsing garbage
            continue
        try:
            obj = json.loads(text)
        except json.JSONDecodeError:
            continue
        errors = validate(obj)
        if errors:
            print("schema errors: " + "; ".join(errors), file=sys.stderr)
            continue
        return obj
    raise SystemExit("no valid answer after retries")


if __name__ == "__main__":
    q = sys.argv[1] if len(sys.argv) > 1 else "Which city is the capital of Kazakhstan? Give its country and population in millions."
    print(json.dumps(ask(q), ensure_ascii=False, indent=2))
