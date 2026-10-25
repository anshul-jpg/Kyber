#!/usr/bin/env bash
# Kyber Universal Installer - Linux / macOS
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/<repo>/master/install.sh | bash

set -e

BOLD="\033[1m"
CYAN="\033[36m"
GREEN="\033[32m"
YELLOW="\033[33m"
RESET="\033[0m"

echo -e ""
echo -e "${CYAN}${BOLD}   ██╗  ██╗██╗   ██╗██████╗ ███████╗██████╗ ${RESET}"
echo -e "${CYAN}${BOLD}   ██║ ██╔╝╚██╗ ██╔╝██╔══██╗██╔════╝██╔══██╗${RESET}"
echo -e "${CYAN}${BOLD}   █████╔╝  ╚████╔╝ ██████╔╝█████╗  ██████╔╝${RESET}"
echo -e "${CYAN}${BOLD}   ██╔═██╗   ╚██╔╝  ██╔══██╗██╔══╝  ██╔══██╗${RESET}"
echo -e "${CYAN}${BOLD}   ██║  ██╗   ██║   ██████╔╝███████╗██║  ██║${RESET}"
echo -e "   Autonomous Pocket Supervisor for Antigravity & AI IDEs"
echo -e ""

echo -e "${GREEN}${BOLD}[1/3]${RESET} Configuring Universal Global Hook..."

GLOBAL_CONFIG_DIR="$HOME/.gemini/config"
mkdir -p "$GLOBAL_CONFIG_DIR"

GLOBAL_INTERCEPTOR="$GLOBAL_CONFIG_DIR/interceptor.js"
GLOBAL_HOOKS="$GLOBAL_CONFIG_DIR/hooks.json"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || echo "")"
if [ -f "$SCRIPT_DIR/packages/cli/assets/interceptor.js" ]; then
    cp "$SCRIPT_DIR/packages/cli/assets/interceptor.js" "$GLOBAL_INTERCEPTOR"
else
    curl -fsSL "https://raw.githubusercontent.com/anshul/kyber/master/packages/cli/assets/interceptor.js" -o "$GLOBAL_INTERCEPTOR" 2>/dev/null || true
fi

cat <<EOF > "$GLOBAL_HOOKS"
{
  "companion-interceptor": {
    "PreToolUse": [
      {
        "matcher": "run_command|write_to_file|replace_file_content|multi_replace_file_content|ask_question",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$GLOBAL_INTERCEPTOR\"",
            "timeout": 130
          }
        ]
      }
    ]
  }
}
EOF

echo -e "  ${GREEN}[OK]${RESET} Universal Hook installed to $GLOBAL_HOOKS"

# Mode initialization
if [ ! -f "$HOME/.agy-companion-mode" ]; then
    echo "remote" > "$HOME/.agy-companion-mode"
fi
echo -e "  ${GREEN}[OK]${RESET} Mode set to $(cat "$HOME/.agy-companion-mode")"

echo -e "${GREEN}${BOLD}[2/3]${RESET} Checking IDE command line tools..."
for cmd in antigravity code cursor; do
    if command -v "$cmd" >/dev/null 2>&1; then
        echo -e "  ${GREEN}[OK]${RESET} Detected IDE: $cmd"
    fi
done

echo -e ""
echo -e "${GREEN}${BOLD}===============================================================${RESET}"
echo -e "${GREEN}${BOLD}   KYBER SETUP COMPLETE!                                      ${RESET}"
echo -e "${GREEN}${BOLD}===============================================================${RESET}"
echo -e "Open Antigravity, click the KYBER icon, scan the QR code with your phone!"
echo -e ""
