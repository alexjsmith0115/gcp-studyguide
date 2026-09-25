#!/bin/bash
# Startup script for lab32-backend. It serves one page on TCP port 8080.
# It uses the Python 3 that the Debian image includes, because the VM has no internet access to install packages.
mkdir -p /srv/lab32
echo "Hello from lab32-backend at $(hostname -I | awk '{print $1}'). This VM has no external IP address." > /srv/lab32/index.html
systemd-run --unit=lab32-web python3 -m http.server 8080 --directory /srv/lab32
