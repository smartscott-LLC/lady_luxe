#!/usr/bin/env python3
"""Lady Luxe — IndexNow pinger.

Notifies Bing/Yandex (api.indexnow.org routes to all participating
engines) the moment catalog content changes. Reads the site's sitemap,
sends every URL as one batch, and reports what each engine accepted.

Usage: python3 ping-indexnow.py [--only-starting /path] [key]
"""
import json, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KEY_FILE = Path("/tmp/opencode/indexnow-key")
HOST = "https://www.ladyluxeclub.com"
ENDPOINT = "https://api.indexnow.org/indexnow"

key = ""
if len(sys.argv) > 2 and sys.argv[1] == "--key":
    key = sys.argv[2]
elif KEY_FILE.is_file():
    key = KEY_FILE.read_text().strip()
else:
    key = sys.argv[-1]

if not key:
    print("no key — pass the key or write it to /tmp/opencode/indexnow-key")
    sys.exit(1)

# the sitemap lives on the live site
smreq = urllib.request.Request(
    f"{HOST}/sitemap.xml", headers={"User-Agent": "LadyLuxe/1.0"})
sitemap = urllib.request.urlopen(smreq, timeout=60).read().decode()
urls = [u.split("<loc>")[1].split("</loc>")[0] for u in sitemap.split("<url>")[1:]]

if len(sys.argv) > 2 and sys.argv[1] == "--only-starting":
    stem = sys.argv[2]
    urls = [u for u in urls if u.startswith(stem)]

print(f"{len(urls)} urls from the sitemap")

payload = json.dumps({
    "host": "www.ladyluxeclub.com",
    "key": key,
    "urlList": urls,
}).encode()

req = urllib.request.Request(
    ENDPOINT, data=payload, method="POST",
    headers={"Content-Type": "application/json; charset=utf-8"})
resp = urllib.request.urlopen(req, timeout=60)
print("HTTP", resp.status, "-", {
    200: "accepted — the engines will crawl the batch",
    202: "accepted for later processing",
    400: "rejected: the payload is malformed",
    403: "rejected: the key doesn't validate",
    422: "rejected: a URL doesn't belong to the host",
    429: "throttled — retry later",
}.get(resp.status, resp.status))
