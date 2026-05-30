#!/usr/bin/env python3
"""Simple HTTP server for Echoes Below. Run: python3 serve.py"""
import http.server, socketserver, os, webbrowser, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
os.chdir(os.path.dirname(os.path.abspath(__file__)))

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # suppress request logs

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    url = f"http://localhost:{PORT}"
    print(f"\n  Echoes Below läuft auf {url}\n")
    print("  Öffne den Browser oder drücke Ctrl+C zum Beenden.\n")
    try:
        webbrowser.open(url)
    except Exception:
        pass
    httpd.serve_forever()
