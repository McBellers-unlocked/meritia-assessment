#!/usr/bin/env bash
# Run after Amplify's first deploy gives you a URL.
# Usage: ./scripts/wire-cognito-to-amplify.sh https://main.xxxxxxxxxxxx.amplifyapp.com
set -euo pipefail
AMPLIFY_URL=${1:?"Pass the Amplify URL, e.g. https://main.xxxxx.amplifyapp.com"}
POOL_ID=eu-west-1_ljeZoMw83
CLIENT_ID=7i5k87m0khghela6atnqvoc6dh

echo "Updating Cognito app client callback + sign-out URLs to include ${AMPLIFY_URL}"
aws cognito-idp update-user-pool-client \
  --user-pool-id "$POOL_ID" \
  --client-id "$CLIENT_ID" \
  --callback-urls \
    "http://localhost:3000/api/auth/callback/cognito" \
    "${AMPLIFY_URL%/}/api/auth/callback/cognito" \
  --logout-urls \
    "http://localhost:3000" \
    "${AMPLIFY_URL%/}" \
  --supported-identity-providers COGNITO \
  --explicit-auth-flows ALLOW_USER_SRP_AUTH ALLOW_REFRESH_TOKEN_AUTH \
  --allowed-o-auth-flows code \
  --allowed-o-auth-scopes openid email profile \
  --allowed-o-auth-flows-user-pool-client \
  --prevent-user-existence-errors ENABLED \
  --output text --query 'UserPoolClient.CallbackURLs'

echo ""
echo "Next: set NEXTAUTH_URL=${AMPLIFY_URL%/} in Amplify env vars and redeploy."
