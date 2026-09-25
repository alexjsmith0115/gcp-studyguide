#!/bin/bash
# Startup script for lab13-producer-vm. It runs a small HTTP service on port 80.
# The reply shows the VM name and the source IP address that the VM sees.
# It needs no internet access: Debian images include python3.

cat > /opt/lab13-server.py <<'PYEOF'
import http.server
import socket


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        body = (f"Hello from {socket.gethostname()}. "
                f"You connected from {self.client_address[0]}.\n").encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        pass


http.server.ThreadingHTTPServer(("", 80), Handler).serve_forever()
PYEOF

cat > /etc/systemd/system/lab13-web.service <<'UNITEOF'
[Unit]
Description=Lab 13 test web service
After=network-online.target

[Service]
ExecStart=/usr/bin/python3 /opt/lab13-server.py
Restart=always

[Install]
WantedBy=multi-user.target
UNITEOF

systemctl daemon-reload
systemctl enable --now lab13-web.service
