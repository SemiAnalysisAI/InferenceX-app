"""Serve one extracted H3 CI bundle on loopback for the /video local demo."""
import argparse
import functools
import http.server
from pathlib import Path
from urllib.parse import unquote, urlsplit

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("directory", type=Path)
parser.add_argument("--port", type=int, default=8769)
args = parser.parse_args()
root = args.directory.resolve(strict=True)
allowed = {"SHA256SUMS"}
for line in (root / "SHA256SUMS").read_text().splitlines():
    _, name = line.split("  ", 1)
    path = (root / name).resolve(strict=True)
    if not path.is_relative_to(root) or not path.is_file():
        raise ValueError(f"Artifact escapes selected directory: {name}")
    allowed.add(name)


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        origin = self.headers.get("Origin")
        if origin in {"http://127.0.0.1:3000", "http://localhost:3000"}:
            self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Vary", "Origin")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_head(self):
        name = unquote(urlsplit(self.path).path).removeprefix("/")
        if name not in allowed or not (root / name).resolve().is_relative_to(root):
            self.send_error(404)
            return None
        return super().send_head()


print(f"H3 manifest: http://127.0.0.1:{args.port}/manifest.json", flush=True)
http.server.ThreadingHTTPServer(
    ("127.0.0.1", args.port), functools.partial(Handler, directory=str(root))
).serve_forever()
