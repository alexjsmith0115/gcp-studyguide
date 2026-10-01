"""lab60 test client and load generator. It uses only the standard library.

python load.py URL COUNT   Sends COUNT requests, one at a time, and counts the answers.
python load.py URL         Sends requests from 4 threads, with no pause, until it stops.
"""
import collections
import sys
import threading
import urllib.request


def get(url):
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            return resp.read().decode().strip()
    except Exception as e:  # an error is also an answer: count it
        return f"error: {type(e).__name__}"


def load_forever(url):
    while True:
        get(url)


if __name__ == "__main__":
    url = sys.argv[1]
    if len(sys.argv) > 2:  # test mode: which Pods answer?
        answers = collections.Counter(get(url) for _ in range(int(sys.argv[2])))
        for answer, count in answers.most_common():
            print(f"{count:4} {answer}")
    else:  # load mode: each thread sends its next request at once
        for _ in range(4):
            threading.Thread(target=load_forever, args=(url,)).start()
