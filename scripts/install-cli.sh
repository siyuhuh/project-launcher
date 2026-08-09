#!/usr/bin/env bash

set -euo pipefail

readonly repository="siyuhuh/project-launcher"
readonly install_directory="${HOME}/.local/bin"
readonly temporary_directory="$(mktemp -d "${TMPDIR:-/tmp}/runbox-cli.XXXXXX")"

cleanup() {
  rm -rf "$temporary_directory"
}
trap cleanup EXIT

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This installer is for macOS. Use scripts/install-cli.ps1 on Windows." >&2
  exit 1
fi

case "$(uname -m)" in
  arm64|aarch64)
    asset="runbox-cli-aarch64.tar.gz"
    ;;
  x86_64|amd64)
    asset="runbox-cli-x64.tar.gz"
    ;;
  *)
    echo "Unsupported macOS architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

archive="${temporary_directory}/${asset}"
curl --fail --location --retry 3 --output "$archive" \
  "https://github.com/${repository}/releases/latest/download/${asset}"

tar -xzf "$archive" -C "$temporary_directory"
mkdir -p "$install_directory"
install -m 755 "${temporary_directory}/p" "${install_directory}/p"

echo "Installed p to ${install_directory}/p"
if [[ ":${PATH}:" != *":${install_directory}:"* ]]; then
  echo "Add it to your shell PATH with:"
  echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
  echo "Then open a new Terminal window and run: p --help"
else
  echo "Run: p --help"
fi
