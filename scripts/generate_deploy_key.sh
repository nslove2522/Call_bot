#!/usr/bin/env bash
set -euo pipefail

OUT_DIR=".github/keys"
KEY_NAME="deploy_key"
mkdir -p "$OUT_DIR"

if [ -f "$OUT_DIR/$KEY_NAME" ]; then
  echo "Key already exists: $OUT_DIR/$KEY_NAME"
  echo "To regenerate, delete the existing files and re-run this script."
  exit 0
fi

echo "Generating an Ed25519 SSH key pair for GitHub Actions deploy..."
ssh-keygen -t ed25519 -f "$OUT_DIR/$KEY_NAME" -N "" -C "github-deploy-key"

echo
echo "Private key: $OUT_DIR/$KEY_NAME"
echo "Public key:  $OUT_DIR/$KEY_NAME.pub"
echo
echo "Next steps:" 
echo "1) Copy the public key ($OUT_DIR/$KEY_NAME.pub) contents to your server user's ~/.ssh/authorized_keys"
echo "   e.g. on your server run: mkdir -p ~/.ssh && echo '<paste-public-key>' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
echo "2) Add the private key contents to your GitHub repo secret named DEPLOY_KEY"
echo "   e.g. cat $OUT_DIR/$KEY_NAME | pbcopy  # macOS, or just open and copy"
echo
echo "3) Add other required GitHub secrets: SSH_HOST, SSH_USER, SSH_PORT (optional), DOMAIN, REPO_URL, BRANCH"
echo
echo "After that, push to main or trigger the workflow in Actions to deploy."
