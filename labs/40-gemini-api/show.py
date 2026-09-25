#!/usr/bin/env python3
"""Print the useful parts of a saved Gemini API response for lab 40.

For a generateContent response, the script prints the answer text, the token
counts from usageMetadata, and an estimated token cost. For a grounded answer,
it also prints the search queries and the source pages. For a countTokens
response, it prints the token count. For an error response, it prints the
error message. It only reads a local file.

Examples:
  python3 labs/40-gemini-api/show.py "$LAB40_DIR/basic.json"
  python3 labs/40-gemini-api/show.py --text "$LAB40_DIR/ticket.json"
  python3 labs/40-gemini-api/show.py --non-global "$LAB40_DIR/us.json"
"""
import argparse
import json
import sys

# Gemini 3.1 Flash-Lite, Standard PayGo, USD per 1M tokens (input, output), from
# https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing
# Google bills thinking tokens at the output price.
PRICES = {"global": (0.25, 1.50), "non-global": (0.275, 1.65)}


def answer_text(candidate):
    parts = candidate.get("content", {}).get("parts", [])
    return "".join(p.get("text", "") for p in parts if not p.get("thought"))


def main():
    parser = argparse.ArgumentParser(description="Print a saved Gemini API response.")
    parser.add_argument("file", help="JSON file that curl saved")
    parser.add_argument("--text", action="store_true", help="print only the answer text")
    parser.add_argument("--non-global", action="store_true",
                        help="use the multi-region (non-global) price for the estimate")
    args = parser.parse_args()
    with open(args.file) as f:
        r = json.load(f)

    if "error" in r:
        print(f"API error {r['error'].get('code')}: {r['error'].get('message')}")
        sys.exit(1)
    if "totalTokens" in r:
        print(f"countTokens: totalTokens={r['totalTokens']}")
        return

    candidates = r.get("candidates", [])
    if args.text:
        print(answer_text(candidates[0]) if candidates else "")
        return
    for c in candidates:
        print(answer_text(c).strip())
        print(f"\nfinishReason: {c.get('finishReason')}")
        g = c.get("groundingMetadata")
        if g:
            print(f"webSearchQueries: {g.get('webSearchQueries', [])}")
            for chunk in g.get("groundingChunks", []):
                web = chunk.get("web", {})
                print(f"  source: {web.get('title', '')} ({web.get('domain', '')})")
            print(f"searchEntryPoint returned: {'searchEntryPoint' in g}")

    u = r.get("usageMetadata", {})
    prompt = u.get("promptTokenCount", 0)
    output = u.get("candidatesTokenCount", 0)
    thoughts = u.get("thoughtsTokenCount", 0)
    line = f"usageMetadata: prompt={prompt} output={output} thoughts={thoughts}"
    if "toolUsePromptTokenCount" in u:
        line += f" toolUsePrompt={u['toolUsePromptTokenCount']}"
    print(f"{line} total={u.get('totalTokenCount', 0)}")
    region = "non-global" if args.non_global else "global"
    price_in, price_out = PRICES[region]
    cost = (prompt * price_in + (output + thoughts) * price_out) / 1_000_000
    print(f"estimated cost of prompt, output, and thinking tokens ({region} price): ${cost:.6f}")


if __name__ == "__main__":
    main()
