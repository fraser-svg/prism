#!/bin/bash
# prism-service.sh — Manage the Prism Dashboard as a macOS launchd service

LABEL="com.prism.dashboard"
PLIST_DEST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/.prism/logs"
LOG_FILE="$LOG_DIR/dashboard.log"
PORT=3333

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER="$SCRIPT_DIR/server.cjs"

usage() {
  cat <<EOF
Usage: prism-service.sh <command> [options]

Commands:
  install [project-dir]   Install and start the dashboard service
  uninstall               Stop and remove the dashboard service
  status                  Show service status
  switch [project-dir]    Switch to a different project
  logs                    Tail the log file
EOF
  exit 1
}

resolve_prism_dir() {
  local dir="${1:-$PWD}"
  dir="$(cd "$dir" 2>/dev/null && pwd)" || { echo "Error: Invalid directory: $1" >&2; exit 1; }
  # Walk up to find .prism
  while [[ "$dir" != "/" ]]; do
    if [[ -d "$dir/.prism" ]]; then
      echo "$dir/.prism"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  echo "Error: No .prism directory found in $1 or parent directories." >&2
  exit 1
}

generate_plist() {
  local node_path="$1"
  local server_path="$2"
  local prism_dir="$3"

  cat <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$node_path</string>
        <string>$server_path</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PRISM_DIR</key>
        <string>$prism_dir</string>
        <key>PORT</key>
        <string>$PORT</string>
    </dict>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <false/>
    <key>StandardOutPath</key>
    <string>$LOG_FILE</string>
    <key>StandardErrorPath</key>
    <string>$LOG_FILE</string>
</dict>
</plist>
PLIST
}

cmd_install() {
  local prism_dir
  prism_dir="$(resolve_prism_dir "${1:-}")"

  local node_path
  node_path="$(which node)" || { echo "Error: node not found in PATH" >&2; exit 1; }

  if [[ ! -f "$SERVER" ]]; then
    echo "Error: server.cjs not found at $SERVER" >&2
    exit 1
  fi

  # Create log directory
  mkdir -p "$LOG_DIR"

  # Generate plist with correct paths
  generate_plist "$node_path" "$SERVER" "$prism_dir" > "$PLIST_DEST"

  # Load the service
  launchctl load "$PLIST_DEST"

  echo "◆ Prism Dashboard installed as background service"
  echo "  http://localhost:$PORT"
  echo "  Watching: $prism_dir"
}

cmd_uninstall() {
  if [[ ! -f "$PLIST_DEST" ]]; then
    echo "Service is not installed."
    exit 0
  fi

  launchctl unload "$PLIST_DEST" 2>/dev/null
  rm -f "$PLIST_DEST"
  echo "◆ Prism Dashboard service uninstalled."
}

cmd_status() {
  if launchctl list | grep -q "$LABEL"; then
    local prism_dir=""
    if [[ -f "$PLIST_DEST" ]]; then
      prism_dir="$(/usr/libexec/PlistBuddy -c "Print :EnvironmentVariables:PRISM_DIR" "$PLIST_DEST" 2>/dev/null)"
    fi
    echo "◆ Prism Dashboard is running"
    echo "  http://localhost:$PORT"
    [[ -n "$prism_dir" ]] && echo "  Watching: $prism_dir"
  else
    echo "◇ Prism Dashboard is not running"
    if [[ -f "$PLIST_DEST" ]]; then
      echo "  (plist installed but service not loaded)"
    fi
  fi
}

cmd_switch() {
  local prism_dir
  prism_dir="$(resolve_prism_dir "${1:-}")"

  local node_path
  node_path="$(which node)" || { echo "Error: node not found in PATH" >&2; exit 1; }

  # Unload if currently loaded
  if launchctl list | grep -q "$LABEL"; then
    launchctl unload "$PLIST_DEST" 2>/dev/null
  fi

  # Regenerate plist with new project
  mkdir -p "$LOG_DIR"
  generate_plist "$node_path" "$SERVER" "$prism_dir" > "$PLIST_DEST"

  # Reload
  launchctl load "$PLIST_DEST"

  echo "◆ Prism Dashboard switched"
  echo "  http://localhost:$PORT"
  echo "  Watching: $prism_dir"
}

cmd_logs() {
  if [[ -f "$LOG_FILE" ]]; then
    tail -f "$LOG_FILE"
  else
    echo "No log file found at $LOG_FILE"
    exit 1
  fi
}

# Main dispatch
case "${1:-}" in
  install)   cmd_install "$2" ;;
  uninstall) cmd_uninstall ;;
  status)    cmd_status ;;
  switch)    cmd_switch "$2" ;;
  logs)      cmd_logs ;;
  *)         usage ;;
esac
