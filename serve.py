#!/usr/bin/env python
"""无日志、线程化的本地看板服务器，避免工具后台管道阻塞浏览器请求。"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os

ROOT = Path(__file__).resolve().parent
HOST = "127.0.0.1"
PORT = 8765

class QuietHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, format, *args):
        pass

class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

if __name__ == "__main__":
    os.chdir(ROOT)
    with Server((HOST, PORT), QuietHandler) as server:
        server.serve_forever()
