# UNIQAssess — live deployment state

Snapshot of what's provisioned in AWS as of first carve-out deploy.
Update this doc if you move regions, rotate secrets, or re-provision.

> **Domain change in flight (2026-04-29):** canonical domain has been moved
> from `meritia.org` to `www.uniqassess.org` (DNS now in Route 53). Items
> still to complete on the AWS side are flagged 🟡 below. Items in code are
> already updated.

## Identities

- AWS account: `891612540396`
- Region: `eu-west-1` (Ireland)
- GitHub repo: <https://github.com/McBellers-unlocked/meritia-assessment>

## Amplify

| Field | Value |
|-------|-------|
| App name | `meritia-assessment` |
| App ID | `d1wxabrgr6nkub` |
| Default domain | `https://main.d1wxabrgr6nkub.amplifyapp.com` |
| Branch | `main` (auto-build enabled) |
| First green build | Job 4, commit `40fa336` |
| Custom rules | 🟡 Replace existing meritia.* redirect rules with: apex `uniqassess.org/*` → `https://www.uniqassess.org/*` (301). Optionally also add legacy `meritia.org/*` → `https://www.uniqassess.org/*` and `meritia.net/*` → `https://www.uniqassess.org/*` if you want backward-compat for the old URLs. |

Environment variables set on the app (values redacted):
`ANTHROPIC_API_KEY`, `COGNITO_CLIENT_ID`, `COGNITO_ISSUER`, `DATABASE_URL`,
`NEXTAUTH_SECRET`, `NEXTAUTH_URL`.

## Cognito

| Field | Value |
|-------|-------|
| User pool | `meritia-users` / `eu-west-1_ljeZoMw83` |
| App client | `meritia-web` / `7i5k87m0khghela6atnqvoc6dh` |
| Hosted UI domain | `https://meritia.auth.eu-west-1.amazoncognito.com` |
| Issuer URL | `https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_ljeZoMw83` |
| Admin group | `admin` |
| Admin users | `mattvalente85@gmail.com` (in `admin` group) |
| Self-registration | Disabled — `AllowAdminCreateUserOnly=true` |
| Allowed callback URLs | 🟡 Should be: `http://localhost:3000/api/auth/callback/cognito`, `https://main.d1wxabrgr6nkub.amplifyapp.com/api/auth/callback/cognito`, `https://www.uniqassess.org/api/auth/callback/cognito`, `https://uniqassess.org/api/auth/callback/cognito`. Run `scripts/wire-cognito-to-domain.sh https://www.uniqassess.org https://main.d1wxabrgr6nkub.amplifyapp.com` to apply. |
| Allowed sign-out URLs | 🟡 Should be: `http://localhost:3000`, `https://main.d1wxabrgr6nkub.amplifyapp.com`, `https://www.uniqassess.org`, `https://uniqassess.org`. Same script applies these. |

## RDS

| Field | Value |
|-------|-------|
| Instance ID | `meritia-db` |
| Engine | PostgreSQL 16 |
| Class | `db.t3.micro` (free-tier) |
| Storage | 20 GB gp2, encrypted (default KMS) |
| Endpoint | `meritia-db.c9meyguoao54.eu-west-1.rds.amazonaws.com:5432` |
| Database | `meritia` |
| Master user | `meritia_admin` (password in local `.env.local`) |
| Backups | 7-day retention |
| Public access | Yes (pilot) |
| Security group | `meritia-db-sg` / `sg-03b479bc7cdb73da9` — inbound 5432 from `0.0.0.0/0` |
| Schema | Applied via `npx prisma db push` on first deploy |

## Custom domains

Canonical: `https://www.uniqassess.org`. DNS hosted in AWS Route 53
(transitioned 2026-04-29).

### uniqassess.org (canonical via www)

| Record | Type | Host | Target |
|---|---|---|---|
| Cert verification | CNAME | (auto-created by Amplify in Route 53 once domain is connected) | (ACM validation target) |
| Apex `uniqassess.org` | ALIAS (A) | `@` | Amplify CloudFront target |
| `www.uniqassess.org` | ALIAS (A) | `www` | Amplify CloudFront target |

Route 53 supports ALIAS at the apex natively, so no CNAME-flattening trick
needed. Apex gets 301'd to www by an Amplify custom rule (see Amplify
table above).

### meritia.org / meritia.net (legacy)

Optional: keep these registered and add Amplify 301 rules pointing them at
`https://www.uniqassess.org` if you want any old links to keep working.
Otherwise let them lapse — the rebrand is complete.

### Pending AWS-side actions (🟡 in tables above)

Code is already pointing at the new domain. Remaining operational steps in
the AWS console:

1. **Amplify → Domain management**: confirm `uniqassess.org` and
   `www.uniqassess.org` are connected to the app and status reads
   `AVAILABLE`. (Route 53 should make this fast — usually <15 min for cert
   issuance once the hosted zone is set.)
2. **Amplify → Environment variables**: set `NEXTAUTH_URL=https://www.uniqassess.org`
   and redeploy the `main` branch.
3. **Amplify → Rewrites and redirects**: add 301 rules per the table above.
4. **Cognito → App integration → App clients → meritia-web → Hosted UI**:
   add `https://www.uniqassess.org/api/auth/callback/cognito` (and the apex
   variant) to **Allowed callback URLs**, and `https://www.uniqassess.org`
   (and apex) to **Allowed sign-out URLs**. Easiest path:
   `./scripts/wire-cognito-to-domain.sh https://www.uniqassess.org https://main.d1wxabrgr6nkub.amplifyapp.com`
   from a shell with AWS CLI configured (region `eu-west-1`, profile with
   `cognito-idp:UpdateUserPoolClient`).
5. **(Optional)** Cognito Hosted UI domain prefix is still `meritia` —
   users see `meritia.auth.eu-west-1.amazoncognito.com` briefly during
   sign-in. To rebrand: Cognito console → User pool → App integration →
   Domain → delete current Cognito domain and recreate with prefix
   `uniqassess`. Functional impact: none, but cosmetically it still says
   "meritia" until done.

### Smoke test (after the steps above)

1. Wait for Amplify domain status to flip to `AVAILABLE`.
2. Visit `https://www.uniqassess.org/login`, sign in as
   `mattvalente85@gmail.com`, confirm redirect to `/admin/recruitment`.
3. `curl -I https://uniqassess.org` should return 301 to
   `https://www.uniqassess.org/`.

## Secrets

Local-only file — never committed. Contains:

| Var | Stored where |
|-----|--------------|
| `RDS_MASTER_PASSWORD` | `C:/dev/meritia/.env.local` only |
| `NEXTAUTH_SECRET` | Local file + Amplify env vars |
| `ANTHROPIC_API_KEY` | Local file + Amplify env vars (set by operator) |
| `DATABASE_URL` | Local file + Amplify env vars |

If you rotate any of these: update both the local file (for dev) and
the Amplify env var (for prod), then redeploy.

## Helper scripts

- `scripts/wire-cognito-to-amplify.sh <amplify-url>` — add the Amplify default URL to Cognito's allowed lists. Already run.
- `scripts/wire-cognito-to-domain.sh <domain-url> <amplify-url>` — add both to Cognito's allowed lists. 🟡 Re-run with `https://www.uniqassess.org` after the new custom domain is `AVAILABLE`.

## Change log

- `2026-04-17`: initial provisioning (Cognito, RDS, Amplify, schema push, both domains attached).
- `2026-04-29`: rebrand Meritia → UNIQAssess (in-app + code). Domain transitioned from `meritia.org` to `www.uniqassess.org` via Route 53. AWS resource IDs (RDS instance, Cognito pool, Amplify app, GitHub repo) kept on the original `meritia-*` names — these are infra identifiers, not user-visible.
