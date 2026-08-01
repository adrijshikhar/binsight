#!/bin/sh
# binsight installer — https://github.com/adrijshikhar/binsight
#
#   curl -fsSL https://raw.githubusercontent.com/adrijshikhar/binsight/main/install.sh | sh
#
# Installs the binsight binary to ~/.local/bin (no sudo, ever) and makes sure
# that directory is on your PATH.
#
# Environment:
#   BINSIGHT_VERSION          install a specific tag (default: latest release)
#   BINSIGHT_INSTALL_DIR      override the install directory
#   BINSIGHT_NO_MODIFY_PATH   set to skip editing shell rc files
#
# POSIX sh on purpose: this must run under dash, so no arrays and no bashisms.

set -eu

REPO="adrijshikhar/binsight"
INSTALL_DIR="${BINSIGHT_INSTALL_DIR:-$HOME/.local/bin}"
BIN_NAME="binsight"
TMPDIR_=""

# ---------------------------------------------------------------- output ----

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
    C_RED=$(printf '\033[0;31m'); C_GRN=$(printf '\033[0;32m')
    C_YEL=$(printf '\033[0;33m'); C_DIM=$(printf '\033[2m')
    C_OFF=$(printf '\033[0m')
else
    C_RED=''; C_GRN=''; C_YEL=''; C_DIM=''; C_OFF=''
fi

info()  { printf '%s\n' "$*"; }
step()  { printf '%s==>%s %s\n' "$C_DIM" "$C_OFF" "$*"; }
ok()    { printf '%s✓%s %s\n' "$C_GRN" "$C_OFF" "$*"; }
warn()  { printf '%s!%s %s\n' "$C_YEL" "$C_OFF" "$*" >&2; }
die()   { printf '%serror:%s %s\n' "$C_RED" "$C_OFF" "$*" >&2; exit 1; }

cleanup() { [ -n "$TMPDIR_" ] && rm -rf "$TMPDIR_"; }
trap cleanup EXIT

# ------------------------------------------------------------ prequisites ---

need() { command -v "$1" >/dev/null 2>&1; }

if need curl; then
    DL="curl -fsSL -o"
elif need wget; then
    DL="wget -qO"
else
    die "need curl or wget. Install one and re-run."
fi

need tar || die "need tar. Install it and re-run."

# fetch <url> <dest>
fetch() { $DL "$2" "$1"; }

# ---------------------------------------------------------------- detect ----

os=$(uname -s | tr '[:upper:]' '[:lower:]')
case "$os" in
    darwin) OS=darwin ;;
    linux)  OS=linux ;;
    *) die "unsupported OS: $os. Prebuilt binaries: https://github.com/$REPO/releases" ;;
esac

arch=$(uname -m)
case "$arch" in
    x86_64|amd64)  ARCH=amd64 ;;
    aarch64|arm64) ARCH=arm64 ;;
    *) die "unsupported architecture: $arch. Prebuilt binaries: https://github.com/$REPO/releases" ;;
esac

# --------------------------------------------------------------- version ----

VERSION="${BINSIGHT_VERSION:-}"
if [ -z "$VERSION" ]; then
    step "Resolving latest release"
    TMPDIR_=$(mktemp -d)
    fetch "https://api.github.com/repos/$REPO/releases/latest" "$TMPDIR_/rel.json" \
        || die "could not reach the GitHub API. Set BINSIGHT_VERSION=vX.Y.Z to skip this."
    VERSION=$(sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$TMPDIR_/rel.json" | head -n1)
    [ -n "$VERSION" ] || die "could not parse the latest version. Set BINSIGHT_VERSION=vX.Y.Z."
else
    TMPDIR_=$(mktemp -d)
fi

# Accept both "0.1.1" and "v0.1.1"; assets are named without the leading v.
VER_NO_V=${VERSION#v}
TAG="v$VER_NO_V"

ASSET="${BIN_NAME}_${VER_NO_V}_${OS}_${ARCH}.tar.gz"
BASE="https://github.com/$REPO/releases/download/$TAG"

info "Installing ${BIN_NAME} ${TAG} (${OS}/${ARCH})"

# -------------------------------------------------------------- download ----

step "Downloading $ASSET"
fetch "$BASE/$ASSET" "$TMPDIR_/$ASSET" \
    || die "download failed: $BASE/$ASSET"

step "Verifying checksum"
if fetch "$BASE/checksums.txt" "$TMPDIR_/checksums.txt"; then
    expected=$(grep " $ASSET\$" "$TMPDIR_/checksums.txt" | awk '{print $1}' | head -n1)
    if [ -z "$expected" ]; then
        warn "no checksum listed for $ASSET — skipping verification"
    else
        if need sha256sum;   then actual=$(sha256sum "$TMPDIR_/$ASSET" | awk '{print $1}')
        elif need shasum;    then actual=$(shasum -a 256 "$TMPDIR_/$ASSET" | awk '{print $1}')
        else actual=""; warn "no sha256 tool found — skipping verification"
        fi
        if [ -n "$actual" ]; then
            [ "$actual" = "$expected" ] || die "checksum mismatch for $ASSET
  expected $expected
  actual   $actual
Refusing to install. Please report this at https://github.com/$REPO/issues"
            ok "sha256 verified"
        fi
    fi
else
    warn "could not download checksums.txt — skipping verification"
fi

# --------------------------------------------------------------- install ----

step "Extracting"
tar -xzf "$TMPDIR_/$ASSET" -C "$TMPDIR_" || die "failed to extract $ASSET"
[ -f "$TMPDIR_/$BIN_NAME" ] || die "archive did not contain a '$BIN_NAME' binary"

mkdir -p "$INSTALL_DIR" || die "cannot create $INSTALL_DIR"
[ -w "$INSTALL_DIR" ] || die "$INSTALL_DIR is not writable.
Set BINSIGHT_INSTALL_DIR to a directory you own — this installer never uses sudo."

install_path="$INSTALL_DIR/$BIN_NAME"
mv -f "$TMPDIR_/$BIN_NAME" "$install_path" || die "failed to install to $install_path"
chmod +x "$install_path"

# macOS quarantines anything downloaded from the internet. The binaries are not
# notarized, so without this Gatekeeper SIGKILLs them on first run (exit 137,
# no message).
if [ "$OS" = darwin ] && need xattr; then
    xattr -dr com.apple.quarantine "$install_path" 2>/dev/null || true
fi

ok "Installed $install_path"

# ------------------------------------------------------------------ PATH ----

# Exact match: a substring test would false-positive on e.g. /opt/x/.local/bin.
on_path() {
    printf '%s' "$PATH" | tr ':' '\n' | grep -qx "$1"
}

# Append only when no *uncommented* line already sets it.
append_path_line() {
    rc=$1; line=$2; pattern=$3
    if grep -v '^[[:space:]]*#' "$rc" 2>/dev/null | grep -qE "$pattern"; then
        return 1
    fi
    {
        printf '\n# Added by the binsight installer\n'
        printf '%s\n' "$line"
    } >> "$rc"
    return 0
}

if on_path "$INSTALL_DIR"; then
    :
elif [ -n "${BINSIGHT_NO_MODIFY_PATH:-}" ]; then
    warn "$INSTALL_DIR is not on your PATH. Add it with:"
    info "    export PATH=\"$INSTALL_DIR:\$PATH\""
else
    login_shell=$(basename "${SHELL:-/bin/sh}")
    rc_files=""
    is_fish=false

    case "$login_shell" in
        zsh)
            [ -f "$HOME/.zshrc" ]    && rc_files="$rc_files $HOME/.zshrc"
            [ -f "$HOME/.zprofile" ] && rc_files="$rc_files $HOME/.zprofile"
            # Fresh macOS ships without ~/.zshrc; create it rather than no-op.
            if [ -z "$rc_files" ]; then
                touch "$HOME/.zshrc"
                rc_files=" $HOME/.zshrc"
            fi
            ;;
        bash)
            [ -f "$HOME/.bashrc" ]       && rc_files="$rc_files $HOME/.bashrc"
            [ -f "$HOME/.bash_profile" ] && rc_files="$rc_files $HOME/.bash_profile"
            [ -z "$rc_files" ] && { touch "$HOME/.bashrc"; rc_files=" $HOME/.bashrc"; }
            ;;
        fish)
            is_fish=true
            fish_cfg="$HOME/.config/fish/config.fish"
            mkdir -p "$(dirname "$fish_cfg")"
            touch "$fish_cfg"
            ;;
        *)
            [ -f "$HOME/.bashrc" ] && rc_files="$rc_files $HOME/.bashrc"
            [ -f "$HOME/.zshrc" ]  && rc_files="$rc_files $HOME/.zshrc"
            [ -z "$rc_files" ] && { touch "$HOME/.profile"; rc_files=" $HOME/.profile"; }
            ;;
    esac

    # Login shells on Ubuntu/Debian/WSL read ~/.profile and may skip ~/.bashrc.
    if [ "$is_fish" = false ] && [ -f "$HOME/.profile" ]; then
        case " $rc_files " in
            *" $HOME/.profile "*) ;;
            *) rc_files="$rc_files $HOME/.profile" ;;
        esac
    fi

    changed=""
    if [ "$is_fish" = true ]; then
        if append_path_line "$fish_cfg" \
            "fish_add_path \"$INSTALL_DIR\"" \
            "fish_add_path.*$(basename "$INSTALL_DIR")"; then
            changed="$fish_cfg"
        fi
    else
        for rc in $rc_files; do
            if append_path_line "$rc" \
                "export PATH=\"$INSTALL_DIR:\$PATH\"" \
                "PATH=.*$(basename "$INSTALL_DIR")"; then
                changed="$changed $rc"
            fi
        done
    fi

    if [ -n "$changed" ]; then
        for f in $changed; do ok "Added $INSTALL_DIR to PATH in $f"; done
        info ""
        info "Restart your shell, or run:"
        info "    export PATH=\"$INSTALL_DIR:\$PATH\""
    fi
fi

# ------------------------------------------------------------------ verify --

if [ -x "$install_path" ]; then
    got=$("$install_path" version 2>&1) || die "installed binary failed to run:
$got"
    ok "$got"
else
    die "installation failed: $install_path is not executable"
fi

info ""
info "Get started:"
info "    binsight serve /path/to/binlog/dir"
