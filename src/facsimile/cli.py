from __future__ import annotations

import argparse
import threading
import time
import urllib.request
import webbrowser

import uvicorn


def _open_when_ready(url: str, health_url: str) -> None:
    for _ in range(60):
        try:
            with urllib.request.urlopen(health_url, timeout=0.5):
                webbrowser.open(url)
                return
        except Exception:
            time.sleep(0.25)


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="facsimile",
        description="Launch the Facsimile scanner workstation.",
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8765, type=int)
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Do not automatically open the Facsimile UI.",
    )
    args = parser.parse_args()

    ui_url = f"http://{args.host}:{args.port}/"
    health_url = f"http://{args.host}:{args.port}/health"

    if not args.no_browser:
        threading.Thread(
            target=_open_when_ready,
            args=(ui_url, health_url),
            daemon=True,
        ).start()

    print(f"Facsimile is starting at {ui_url}")
    print("Press Ctrl+C to stop.")

    uvicorn.run(
        "facsimile.api:app",
        host=args.host,
        port=args.port,
        reload=False,
    )


if __name__ == "__main__":
    main()
