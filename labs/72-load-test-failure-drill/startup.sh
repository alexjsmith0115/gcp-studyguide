#!/bin/bash
# Startup script for lab 72. Compute Engine runs it as root at every boot.
# It copies the app from the "app-code" metadata value (the same main.py that
# runs on Cloud Run) and runs it on port 80 as a systemd service. The VMs have
# no external IP address and need no internet access.

MD="http://metadata.google.internal/computeMetadata/v1/instance"
mkdir -p /opt/lab72
curl -sf -H "Metadata-Flavor: Google" "$MD/attributes/app-code" -o /opt/lab72/main.py

cat > /etc/systemd/system/lab72-web.service <<'EOF'
[Unit]
Description=Lab 72 web app on port 80
After=network-online.target

[Service]
Environment=PORT=80
ExecStart=/usr/bin/python3 /opt/lab72/main.py
Restart=always

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now lab72-web.service
