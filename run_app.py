# run_app.py

import threading
import time
import webview
from app import app, socketio


def start_flask():
    print("[INFO] Starting Flask server on port 5000...")
    # host="0.0.0.0" allows external connections if needed
    socketio.run(app, host="127.0.0.1", port=5000, use_reloader=False)


if __name__ == "__main__":
    print("[INFO] Launching Flask in background...")
    flask_thread = threading.Thread(target=start_flask, daemon=True)
    flask_thread.start()

    # Give Flask time to start
    time.sleep(2)

    print("[INFO] Opening WebView App...")
    window = webview.create_window(
        "QA TESTING APP",
        "http://127.0.0.1:5000",   # safer than localhost sometimes
        width=1280,
        height=800,
        resizable=True
    )
    webview.start()
