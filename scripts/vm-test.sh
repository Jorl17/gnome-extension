#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname "$0")/../"

if [ -f .env ]; then
	while IFS='=' read -r key value; do
		if [[ "$key" == VM_* ]] && [ -z "${!key:-}" ]; then
			export "$key=$value"
		fi
	done <.env
fi

if [ -z "${VM_TARGET:-}" ]; then
	echo "Set VM_TARGET=user@vm-ip in the environment or .env"
	echo "Usage: $0 [filter]  (runs suites or tests whose name contains filter)"
	exit 1
fi

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10 -p "${VM_SSH_PORT:-22}")
if [ -n "${VM_SSH_KEY:-}" ]; then
	SSH_OPTS+=(-i "${VM_SSH_KEY/#\~/$HOME}")
fi

REMOTE_DIR=".cache/vicinae-vm-test/$(basename "$PWD")"

echo "==> Syncing $(git rev-parse --abbrev-ref HEAD 2>/dev/null || basename "$PWD") to $VM_TARGET"
ssh "${SSH_OPTS[@]}" "$VM_TARGET" mkdir -p "$REMOTE_DIR"
rsync -az --delete -e "ssh ${SSH_OPTS[*]}" \
	--exclude .git --exclude node_modules --exclude build --exclude dist \
	--exclude .DS_Store --exclude .env --exclude 'scripts/dev-*.sh' \
	./ "$VM_TARGET:$REMOTE_DIR/"

# The script goes over stdin so the VM's login shell (possibly fish) never parses it
{
	printf 'export VM_TEST_KEEP=%q VM_TEST_FILTER=%q\n' "${VM_TEST_KEEP:-0}" "$*"
	printf 'export PATH="$HOME/.bun/bin:$PATH"\n'
	printf 'exec bash "$HOME"/%q/tests/vm/run.sh </dev/null\n' "$REMOTE_DIR"
} | ssh "${SSH_OPTS[@]}" "$VM_TARGET" bash -s
