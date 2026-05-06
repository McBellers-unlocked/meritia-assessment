#!/usr/bin/env bash
# Package the worker Lambda for deployment.
#
# Usage:
#   ./build.sh                        # produces ../task-generator.zip
#   ./build.sh --update               # also pushes to AWS via update-function-code
#
# AWS-side function name: meritia-task-generator (eu-west-1).
set -euo pipefail

cd "$(dirname "$0")"
echo "Installing production deps..."
rm -rf node_modules
npm install --omit=dev --no-audit --no-fund

echo "Zipping..."
rm -f ../task-generator.zip

if command -v zip >/dev/null 2>&1; then
  zip -r ../task-generator.zip \
      index.mjs \
      prompt.mjs \
      package.json \
      node_modules \
      > /dev/null
elif command -v powershell.exe >/dev/null 2>&1; then
  # Windows fallback — bash-on-Windows ships without `zip`.
  powershell.exe -NoProfile -Command \
    "Compress-Archive -Path index.mjs,prompt.mjs,package.json,node_modules -DestinationPath ../task-generator.zip -Force"
else
  echo "Error: need either 'zip' or PowerShell to package the Lambda." >&2
  exit 1
fi

SIZE=$(du -h ../task-generator.zip | cut -f1)
echo "Built ../task-generator.zip ($SIZE)"

if [ "${1:-}" = "--update" ]; then
  echo "Pushing to AWS..."
  aws lambda update-function-code \
    --function-name meritia-task-generator \
    --zip-file fileb://../task-generator.zip \
    --region eu-west-1 \
    --output json | head -c 200
  echo ""
fi
