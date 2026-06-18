#!/usr/bin/env bash
# Install RTK Rust binary
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh

# Verify
rtk --version

# Optional: init global hook for dev commands in this session
# rtk init -g

echo "RTK installed at: $(which rtk)"
echo "Token savings stats: rtk gain"
