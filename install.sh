#!/usr/bin/env bash
#
# Konsolx installer — downloads the latest AppImage, sets up desktop integration.
#
#   curl -fsSL https://raw.githubusercontent.com/adhranjan/konsolx/main/install.sh | bash
#
set -euo pipefail

REPO="adhranjan/konsolx"
APP_NAME="Konsolx"
INSTALL_DIR="${HOME}/.local/bin"
DESKTOP_DIR="${HOME}/.local/share/applications"
ICON_DIR="${HOME}/.local/share/icons"
APP_PATH="${INSTALL_DIR}/${APP_NAME}.AppImage"

say()  { printf '\033[1;32m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m!\033[0m %s\n'  "$1"; }
die()  { printf '\033[1;31mx\033[0m %s\n'  "$1" >&2; exit 1; }

# ── 1. Sanity ─────────────────────────────────────────────────────────────────
[ "$(uname -s)" = "Linux" ] || die "This installer is for Linux. On macOS/Windows, build from source (see README)."
command -v curl >/dev/null || die "curl is required."

# ── 2. FUSE check (AppImages need libfuse2) ───────────────────────────────────
if ! ldconfig -p 2>/dev/null | grep -q "libfuse.so.2"; then
  warn "libfuse2 not found — AppImages need it to run."
  warn "  Fedora:  sudo dnf install fuse fuse-libs"
  warn "  Debian:  sudo apt install libfuse2"
  warn "  Arch:    sudo pacman -S fuse2"
fi

# ── 3. Resolve latest release asset ───────────────────────────────────────────
say "Finding the latest release…"
ASSET_URL=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
  | grep -o "https://[^\"]*\.AppImage" | head -n1)
[ -n "${ASSET_URL}" ] || die "Could not find an AppImage in the latest release."

# ── 4. Download ───────────────────────────────────────────────────────────────
mkdir -p "${INSTALL_DIR}" "${DESKTOP_DIR}" "${ICON_DIR}"
say "Downloading ${APP_NAME}…"
curl -fsSL "${ASSET_URL}" -o "${APP_PATH}"
chmod +x "${APP_PATH}"

# ── 5. Icon (extract from the AppImage if possible, else skip) ────────────────
ICON_PATH="${ICON_DIR}/konsolx.png"
( cd /tmp && "${APP_PATH}" --appimage-extract '*.png' >/dev/null 2>&1 \
    && find /tmp/squashfs-root -name "*.png" 2>/dev/null | sort | tail -n1 \
       | xargs -I{} cp {} "${ICON_PATH}" 2>/dev/null \
    && rm -rf /tmp/squashfs-root ) || true

# ── 6. Desktop entry ──────────────────────────────────────────────────────────
say "Creating desktop entry…"
cat > "${DESKTOP_DIR}/konsolx.desktop" <<EOF
[Desktop Entry]
Name=${APP_NAME}
Comment=Desktop terminal workspace manager
Exec=${APP_PATH} --no-sandbox
Icon=${ICON_PATH}
Terminal=false
Type=Application
Categories=Development;System;TerminalEmulator;
StartupNotify=true
StartupWMClass=konsolx
EOF

update-desktop-database "${DESKTOP_DIR}" 2>/dev/null || true

# ── 7. Done ───────────────────────────────────────────────────────────────────
say "${APP_NAME} installed."
echo
echo "  Launch from your app menu, or run:"
echo "    ${APP_PATH} --no-sandbox"
echo
echo "  Update later by re-running this installer."
echo "  Uninstall:  rm '${APP_PATH}' '${DESKTOP_DIR}/konsolx.desktop'"
