#!/usr/bin/env python3
"""Print the useful parts of a saved pre-trained AI API response for lab 41.

The script finds the response type from its fields. It prints labels and text
from the Vision API, the transcript from Speech-to-Text, entities, sentiment,
and moderation categories from the Natural Language API, and translations from
Cloud Translation. For an error response, it prints the error message.
It only reads a local file. For Gemini responses, use labs/40-gemini-api/show.py.

Example:
  python3 labs/41-ai-apis/show.py "$LAB41_DIR/vision.json"
"""
import json
import sys


def vision(r):
    for i, resp in enumerate(r["responses"], 1):
        print(f"image {i}:")
        if "error" in resp:
            print(f"  error: {resp['error'].get('message')}")
        for label in resp.get("labelAnnotations", []):
            print(f"  label: {label['description']} (score {label.get('score', 0):.2f})")
        texts = resp.get("textAnnotations", [])
        if texts:
            print("  text: " + texts[0]["description"].strip().replace("\n", " | "))


def speech(r):
    for result in r.get("results", []):
        for alt in result.get("alternatives", [])[:1]:
            print(f"transcript: {alt.get('transcript', '').strip()}")
    billed = r.get("metadata", {}).get("totalBilledDuration")
    if billed:
        print(f"billed audio: {billed}")


def entities(r):
    for e in r["entities"]:
        best = max((m.get("probability", 0) for m in e.get("mentions", [])), default=0)
        print(f"entity: {e['name']} ({e['type']}, probability {best:.2f})")


def sentiment(r):
    d = r["documentSentiment"]
    print(f"document: score {d.get('score', 0):.2f}, magnitude {d.get('magnitude', 0):.2f}")
    for s in r.get("sentences", []):
        st = s.get("sentiment", {})
        print(f"  {st.get('score', 0):+.2f}  {s['text']['content']}")


def moderation(r):
    top = sorted(r["moderationCategories"], key=lambda c: c.get("confidence", 0), reverse=True)
    for c in top[:5]:
        print(f"category: {c['name']} (confidence {c.get('confidence', 0):.2f})")


def translation(r):
    for t in r["translations"]:
        print(f"translation: {t['translatedText']}")


def main():
    if len(sys.argv) != 2:
        sys.exit("Usage: show.py RESPONSE.json")
    with open(sys.argv[1]) as f:
        r = json.load(f)
    if "error" in r:
        print(f"API error {r['error'].get('code')}: {r['error'].get('message')}")
        sys.exit(1)
    for key, func in (("responses", vision), ("entities", entities), ("documentSentiment", sentiment),
                      ("moderationCategories", moderation), ("translations", translation)):
        if key in r:
            func(r)
            return
    if "results" in r or "metadata" in r:
        speech(r)
        return
    print("Unknown response type. Open the file to read it.")


if __name__ == "__main__":
    main()
