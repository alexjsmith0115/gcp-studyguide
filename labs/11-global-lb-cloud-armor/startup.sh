#!/bin/bash
# Startup script for lab 11. Compute Engine runs it as root at every boot.
# It serves a small site on port 80 with the Python standard library only,
# so the VMs need no external IP address and no package downloads.
#   /                 an HTML page with the VM name and zone
#                     (Cloud CDN does not cache HTML by default)
#   /static/site.css  a CSS file
#                     (Cloud CDN caches CSS in CACHE_ALL_STATIC mode)

MD="http://metadata.google.internal/computeMetadata/v1/instance"
get_md() { curl -sf -H "Metadata-Flavor: Google" "$MD/$1"; }

NAME="$(get_md name)"
ZONE="$(get_md zone | awk -F/ '{print $NF}')"

mkdir -p /var/www/lab11/static
cat > /var/www/lab11/index.html <<EOF
<!doctype html>
<html><head><link rel="stylesheet" href="/static/site.css"></head>
<body><p>lab11 vm=$NAME zone=$ZONE</p></body></html>
EOF
echo "/* served by vm=$NAME */ body { font-family: sans-serif; }" > /var/www/lab11/static/site.css

# Run the web server as a systemd service, so that it keeps running after
# this script ends and starts again after a reboot.
cat > /etc/systemd/system/lab11-web.service <<'EOF'
[Unit]
Description=Lab 11 web server on port 80
After=network-online.target

[Service]
ExecStart=/usr/bin/python3 -m http.server 80 --directory /var/www/lab11

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now lab11-web.service
