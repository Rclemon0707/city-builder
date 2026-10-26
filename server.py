#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""小人国 · 等距城市建造 —— 本地启动器

只依赖 Python 标准库：
  * 在 127.0.0.1 的随机端口上提供 index.html / game.js
  * 通过 /api/* 接口把存档读写到 saves/ 目录（每个存档一个独立 JSON 文件）
  * 用 Edge / Chrome 的 --app 模式打开，得到一个独立的应用窗口

用法：双击 start-game.cmd，或 python server.py [--no-open]
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SAVE_DIR = os.path.join(BASE_DIR, "saves")
SLOTS = 8
MAX_BODY = 8 * 1024 * 1024
WRITE_LOCK = threading.Lock()


def save_path(slot: int) -> str:
    return os.path.join(SAVE_DIR, f"slot{slot}.json")


def list_saves() -> list[dict]:
    out: list[dict] = []
    for slot in range(1, SLOTS + 1):
        path = save_path(slot)
        if not os.path.exists(path):
            continue
        try:
            with open(path, encoding="utf-8") as fp:
                data = json.load(fp)
        except (OSError, ValueError):
            continue
        if not isinstance(data, dict):
            continue
        day = int(data.get("day") or 1)
        money = int(round(float(data.get("money") or 0)))
        pop = int(round(float(data.get("pop") or 0)))
        saved_at = int(data.get("savedAt") or 0)
        out.append(
            {
                "slot": slot,
                "day": day,
                "money": money,
                "pop": pop,
                "savedAt": saved_at,
                "meta": f"第 {day} 天 · ¥{money:,} · {pop} 人",
            }
        )
    return out


class Handler(SimpleHTTPRequestHandler):
    server_version = "MiniCity/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def log_message(self, fmt, *args):  # 安静模式
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, code: int, payload) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _slot(self):
        match = re.fullmatch(r"/api/save/(\d+)", urlparse(self.path).path)
        if not match:
            return None
        slot = int(match.group(1))
        return slot if 1 <= slot <= SLOTS else None

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health":
            return self._json(200, {"ok": True, "mode": "file", "dir": SAVE_DIR})
        if path == "/api/saves":
            return self._json(200, list_saves())
        slot = self._slot()
        if slot is not None:
            file = save_path(slot)
            if not os.path.exists(file):
                return self._json(404, {"ok": False})
            try:
                with open(file, encoding="utf-8") as fp:
                    return self._json(200, json.load(fp))
            except (OSError, ValueError):
                return self._json(500, {"ok": False})
        super().do_GET()

    def do_PUT(self):
        slot = self._slot()
        if slot is None:
            return self._json(404, {"ok": False})
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY:
            return self._json(400, {"ok": False, "error": "bad length"})
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            return self._json(400, {"ok": False, "error": "bad json"})
        if not isinstance(data, dict):
            return self._json(400, {"ok": False, "error": "bad save"})

        os.makedirs(SAVE_DIR, exist_ok=True)
        with WRITE_LOCK:
            fd, tmp = tempfile.mkstemp(prefix=f"slot{slot}-", suffix=".tmp", dir=SAVE_DIR)
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as fp:
                    json.dump(data, fp, ensure_ascii=False, separators=(",", ":"))
                target = save_path(slot)
                for attempt in range(6):
                    try:
                        os.replace(tmp, target)
                        break
                    except PermissionError:
                        # Windows 上杀毒 / 索引服务偶尔短暂占用文件，重试即可
                        if attempt == 5:
                            raise
                        time.sleep(0.08)
            except Exception:
                try:
                    os.remove(tmp)
                except OSError:
                    pass
                return self._json(500, {"ok": False, "error": "write failed"})
        return self._json(200, {"ok": True})

    def do_DELETE(self):
        slot = self._slot()
        if slot is None:
            return self._json(404, {"ok": False})
        try:
            os.remove(save_path(slot))
        except FileNotFoundError:
            pass
        except OSError:
            return self._json(500, {"ok": False})
        return self._json(200, {"ok": True})


def find_browser():
    roots = [
        os.environ.get("ProgramFiles(x86)"),
        os.environ.get("ProgramFiles"),
        os.environ.get("LocalAppData"),
    ]
    for root in roots:
        if not root:
            continue
        for rel in (
            ("Microsoft", "Edge", "Application", "msedge.exe"),
            ("Google", "Chrome", "Application", "chrome.exe"),
        ):
            path = os.path.join(root, *rel)
            if os.path.exists(path):
                return path
    return None


def open_window(url: str) -> None:
    exe = find_browser()
    if exe:
        profile = os.path.join(BASE_DIR, ".browser-profile")
        try:
            subprocess.Popen(
                [
                    exe,
                    f"--app={url}",
                    "--window-size=1440,900",
                    f"--user-data-dir={profile}",
                    "--no-first-run",
                    "--no-default-browser-check",
                ],
                close_fds=True,
            )
            return
        except OSError:
            pass
    webbrowser.open(url)


def main() -> int:
    os.makedirs(SAVE_DIR, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    port = server.server_address[1]
    url = f"http://127.0.0.1:{port}/"
    threading.Thread(target=server.serve_forever, daemon=True).start()

    print("小人国 · 等距城市建造", flush=True)
    print(f"  存档目录：{SAVE_DIR}", flush=True)
    print(f"  本地地址：{url}", flush=True)
    print("  关闭这个窗口（或按 Ctrl+C）即可退出游戏。", flush=True)
    if "--no-open" not in sys.argv:
        open_window(url)
    try:
        while True:
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\n已退出。", flush=True)
    finally:
        server.shutdown()
    return 0


if __name__ == "__main__":
    sys.exit(main())
