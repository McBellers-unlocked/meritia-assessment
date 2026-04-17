#!/usr/bin/env bash
# Run after your custom domain is live on Amplify.
# Usage: ./scripts/wire-cognito-to-domain.sh https://meritia.yourdomain.com https://main.xxxxx.amplifyapp.com
set -euo pipefail
DOMAIN=${1:?"Pass the custom domain URL"}
AMPLIFY_URL=${2:?"Pass the Amplify URL (keep both so local/dev still works)"}
POOL_ID=eu-west-1_ljeZoMw83
CLIENT_ID=7i5k87m0khghela6atnqvoc6dh

aws cognito-idp update-user-pool-client \
  --user-pool-id "$POOL_ID" \
  --client-id "$CLIENT_ID" \
  --callback-urls \
    "http://localhost:3000/api/auth/callback/cognito" \
    "${AMPLIFY_URL%/}/api/auth/callback/cognito" \
    "${DOMAIN%/}/api/auth/callback/cognito" \
  --logout-urls \
    "http://localhost:3000" \
    "${AMPLIFY_URL%/}" \
    "${DOMAIN%/}" \
  --supported-identity-providers COGNITO \
  --explicit-auth-flows ALLOW_USER_SRP_AUTH ALLOW_REFRESH_TOKEN_AUTH \
  --allowed-o-auth-flows code \
  --allowed-o-auth-scopes openid email profile \
  --allowed-o-auth-flows-user-pool-client \
  --prevent-user-existence-errors ENABLED \
  --output text --query 'UserPoolClient.CallbackURLs'

echo ""
echo "Next: set NEXTAUTH_URL=${DOMAIN%/} in Amplify env vars and redeploy."
