#!/bin/bash
# Startup script for lab 30. Compute Engine runs it as root at every boot.
# It serves one line of text on port 80: the value of the "app-version"
# metadata key, the VM name, and the zone. The v1, v2, and Spot templates
# use this same script and differ only in the "app-version" value.

MD="http://metadata.google.internal/computeMetadata/v1/instance"
get_md() { curl -sf -H "Metadata-Flavor: Google" "$MD/$1"; }

VERSION="$(get_md attributes/app-version || echo unknown)"
NAME="$(get_md name)"
ZONE="$(get_md zone | awk -F/ '{print $NF}')"

mkdir -p /var/www/lab30
echo "app-version=$VERSION vm=$NAME zone=$ZONE" > /var/www/lab30/index.html

# Run the web server as a systemd service, so that it keeps running after
# this script ends and you can stop it to test autohealing.
cat > /etc/systemd/system/lab30-web.service <<'EOF'
[Unit]
Description=Lab 30 web server on port 80
After=network-online.target

[Service]
ExecStart=/usr/bin/python3 -m http.server 80 --directory /var/www/lab30

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now lab30-web.service
