#!/usr/bin/env python3
"""Small HTTP load generator for lab 72. It uses only the Python standard library.

Each worker sends GET requests one after another, so --workers sets how many
requests are in flight at the same time. Every --interval seconds, the script
prints what the client sees: requests per second, the share of HTTP 200
answers, latency percentiles, and status codes. Latency includes time in a
server queue, retries, and backoff, because a user waits for all of it.

With --retries N, a worker retries HTTP 429, 502, 503, 504, and connection
errors up to N times. Before each retry it waits a random time between 0 and
min(--backoff-max, --backoff-base * 2**(attempt - 1)) seconds: exponential
backoff with jitter.

Examples:
  python3 loadgen.py --url "$URL/work?ms=200" --workers 5 --duration 60
  python3 loadgen.py --url "http://$LB_IP/work?ms=50" --workers 8 --by host
  python3 loadgen.py --url "http://$LB_IP/work?ms=50" --workers 8 --retries 3
"""
import argparse
import collections
import http.client
import json
import random
import ssl
import threading
import time
from urllib.parse import urlparse

RETRYABLE = {429, 502, 503, 504}
HEADER = "   clock   reqs     rps    ok%  p50ms  p95ms  p99ms  att/req  inst  codes"


class Target:
    def __init__(self, url):
        u = urlparse(url)
        if u.scheme not in ("http", "https") or not u.hostname:
            raise SystemExit(f"loadgen: not an http or https URL: {url!r}")
        self.https = u.scheme == "https"
        self.host = u.hostname
        self.port = u.port or (443 if self.https else 80)
        self.path = (u.path or "/") + (f"?{u.query}" if u.query else "")

    def connect(self, timeout):
        if self.https:
            return http.client.HTTPSConnection(self.host, self.port, timeout=timeout)
        return http.client.HTTPConnection(self.host, self.port, timeout=timeout)


class Stats:
    """Counters for the current interval and for the whole run."""

    def __init__(self):
        self.lock = threading.Lock()
        self.all_codes, self.all_latencies = collections.Counter(), []
        self.all_attempts, self.all_sources = 0, collections.Counter()
        self._new_interval()

    def _new_interval(self):
        self.codes, self.latencies = collections.Counter(), []
        self.attempts, self.sources = 0, collections.Counter()

    def record(self, outcome, latency_ms, attempts, source):
        with self.lock:
            self.codes[outcome] += 1
            self.all_codes[outcome] += 1
            self.latencies.append(latency_ms)
            self.all_latencies.append(latency_ms)
            self.attempts += attempts
            self.all_attempts += attempts
            if source:
                self.sources[source] += 1
                self.all_sources[source] += 1

    def take_interval(self):
        with self.lock:
            out = (self.codes, sorted(self.latencies), self.attempts, self.sources)
            self._new_interval()
            return out


def percentile(sorted_values, q):
    if not sorted_values:
        return 0.0
    return sorted_values[min(len(sorted_values) - 1, int(q * len(sorted_values)))]


def report(label, seconds, codes, latencies, attempts, sources, show_sources):
    n = sum(codes.values())
    ok = 100.0 * codes.get(200, 0) / n if n else 0.0
    text = (f"{label:>8} {n:>6} {n / max(seconds, 0.001):>7.1f} {ok:>6.1f} "
            f"{percentile(latencies, 0.50):>6.0f} {percentile(latencies, 0.95):>6.0f} "
            f"{percentile(latencies, 0.99):>6.0f} {attempts / n if n else 0:>8.2f} {len(sources):>5}  ")
    text += " ".join(f"{k}:{v}" for k, v in sorted(codes.items(), key=lambda kv: str(kv[0])))
    if show_sources and sources:
        text += "  hosts=" + ",".join(f"{k}:{v}" for k, v in sources.most_common())
    return text


def worker(target, args, deadline, stats):
    conn = None
    while time.time() < deadline:
        start = time.perf_counter()
        attempts, outcome, source = 0, None, None
        while True:
            attempts += 1
            try:
                if conn is None:
                    conn = target.connect(args.timeout)
                conn.request("GET", target.path, headers={"User-Agent": "lab72-loadgen"})
                resp = conn.getresponse()
                body = resp.read()
                outcome = resp.status
                if resp.status == 200:
                    try:
                        source = json.loads(body).get(args.by)
                    except ValueError:
                        source = None
            except (OSError, http.client.HTTPException):
                outcome = "conn-error"
                if conn is not None:
                    conn.close()
                conn = None
            retry = outcome == "conn-error" or outcome in RETRYABLE
            if not retry or attempts > args.retries or time.time() >= deadline:
                break
            cap = min(args.backoff_max, args.backoff_base * 2 ** (attempts - 1))
            time.sleep(random.uniform(0, cap))
        stats.record(outcome, (time.perf_counter() - start) * 1000, attempts, source)


def preflight(target, args):
    try:
        conn = target.connect(args.timeout)
        conn.request("GET", target.path, headers={"User-Agent": "lab72-loadgen"})
        resp = conn.getresponse()
        resp.read()
        conn.close()
        print(f"Preflight: HTTP {resp.status} from {args.url}")
    except ssl.SSLCertVerificationError:
        raise SystemExit("loadgen: the TLS certificate check failed. If you use the python.org "
                         "installer on macOS, run its 'Install Certificates.command', or use Cloud Shell.")
    except (OSError, http.client.HTTPException) as err:
        raise SystemExit(f"loadgen: cannot reach {args.url}: {err}")


def main():
    p = argparse.ArgumentParser(description="Small HTTP load generator for lab 72.")
    p.add_argument("--url", required=True, help="URL to GET, for example https://HOST/work?ms=200")
    p.add_argument("--workers", type=int, default=5, help="requests in flight at the same time (default 5)")
    p.add_argument("--duration", type=int, default=60, help="seconds to run (default 60)")
    p.add_argument("--interval", type=int, default=10, help="seconds between report lines (default 10)")
    p.add_argument("--timeout", type=float, default=30, help="socket timeout in seconds (default 30)")
    p.add_argument("--retries", type=int, default=0,
                   help="retries per request for 429, 502, 503, 504, and connection errors (default 0)")
    p.add_argument("--backoff-base", type=float, default=0.1, help="backoff cap for the first retry, in seconds")
    p.add_argument("--backoff-max", type=float, default=2.0, help="largest backoff cap, in seconds")
    p.add_argument("--by", choices=["instance", "host"], default="instance",
                   help="count answers per app process (Cloud Run) or per VM host name (MIG)")
    args = p.parse_args()

    target = Target(args.url)
    preflight(target, args)
    stats = Stats()
    start = time.time()
    deadline = start + args.duration
    threads = [threading.Thread(target=worker, args=(target, args, deadline, stats), daemon=True)
               for _ in range(args.workers)]
    for t in threads:
        t.start()
    print(f"Running {args.workers} workers for {args.duration} s, retries={args.retries}")
    print(HEADER)
    show = args.by == "host"
    last = start
    try:
        while any(t.is_alive() for t in threads):
            time.sleep(0.2)
            now = time.time()
            if now - last >= args.interval:
                print(report(time.strftime("%H:%M:%S"), now - last, *stats.take_interval(), show), flush=True)
                last = now
    except KeyboardInterrupt:
        print("Stopped with Ctrl-C.")
    now = time.time()
    codes, latencies, attempts, sources = stats.take_interval()
    if codes:
        print(report(time.strftime("%H:%M:%S"), now - last, codes, latencies, attempts, sources, show))
    print("Summary for the whole run:")
    print(report("total", now - start, stats.all_codes, sorted(stats.all_latencies),
                 stats.all_attempts, stats.all_sources, False))
    top = ", ".join(f"{k}:{v}" for k, v in stats.all_sources.most_common(10))
    print(f"Answers by {args.by} (top 10): {top or 'none'}")


if __name__ == "__main__":
    main()
