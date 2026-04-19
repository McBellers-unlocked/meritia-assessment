# Meritia — live deployment state

Snapshot of what's provisioned in AWS as of first carve-out deploy.
Update this doc if you move regions, rotate secrets, or re-provision.

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
| Custom rules | 301 redirects: `meritia.net/*` → `meritia.org/*`, `www.meritia.net/*` → `meritia.org/*`, `www.meritia.org/*` → `meritia.org/*` |

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
| Allowed callback URLs | `http://localhost:3000/api/auth/callback/cognito`, `https://main.d1wxabrgr6nkub.amplifyapp.com/api/auth/callback/cognito`, `https://meritia.org/api/auth/callback/cognito` |
| Allowed sign-out URLs | `http://localhost:3000`, `https://main.d1wxabrgr6nkub.amplifyapp.com`, `https://meritia.org` |

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

## Custom domains (pending DNS)

Both domains attached to the Amplify app. Current status:
`PENDING_VERIFICATION` — waiting for you to add the DNS records below at
your registrar.

### meritia.org (primary — canonical URL)

| Record | Type | Host (at registrar) | Target |
|---|---|---|---|
| Cert verification | CNAME | `_dadbcf6e44cc14feca42f1d7c6e9362e` | `_a6be2b77e73cff45ad61cd0b1bfd99c9.jkddzztszm.acm-validations.aws` |
| Apex | ALIAS/CNAME | `@` (or blank) | `d13bz2pq9tumjc.cloudfront.net` |
| www | CNAME | `www` | `d13bz2pq9tumjc.cloudfront.net` |

### meritia.net (redirects to meritia.org via Amplify 301)

| Record | Type | Host (at registrar) | Target |
|---|---|---|---|
| Cert verification | CNAME | `_8249c09ba4b8fcd3dba2edc3bb517c2f` | `_287abc09fafe76112331e18ae311c167.jkddzztszm.acm-validations.aws` |
| Apex | ALIAS/CNAME | `@` (or blank) | `d162d3pndj7mvv.cloudfront.net` |
| www | CNAME | `www` | `d162d3pndj7mvv.cloudfront.net` |

### assess.meritia.org (candidate-facing — pending)

Split-host architecture: admins live on `meritia.org`, candidates on
`assess.meritia.org`. Attach as a second custom domain on the same Amplify
app, then add the DNS records Amplify returns. After verification, set
Amplify env `CANDIDATE_URL_BASE=https://assess.meritia.org` and redeploy.
The admin APIs that generate invitation URLs prefer `CANDIDATE_URL_BASE`
over `NEXTAUTH_URL`, so invitations automatically use the candidate host.

| Record | Type | Host (at registrar) | Target |
|---|---|---|---|
| Cert verification | CNAME | (from Amplify once attached) | (from Amplify) |
| Subdomain | CNAME | `assess` | (from Amplify — typically `*.cloudfront.net`) |

### DNS flavours — apex CNAME limitations

Standard DNS does not allow a CNAME at the apex (`@` / the naked domain).
Options, pick whichever your registrar supports:

1. **ALIAS / ANAME record** at the apex — Cloudflare, DNSimple, easyDNS,
   some Namecheap plans. Transparent; behaves like a CNAME but is legal at
   apex.
2. **CNAME flattening** — Cloudflare does this automatically once you enable
   it. Acts like ALIAS under the hood.
3. **Migrate DNS to Route 53** — keep the domain registered at your current
   registrar, but change nameservers to Route 53's four. Route 53 supports
   ALIAS natively and Amplify can then write the records directly.
4. **Skip the apex**, use `www.meritia.org` as the canonical URL. Less
   polished; would need the `NEXTAUTH_URL` env var + custom rules adjusted
   to redirect root → www.

### Once DNS is live

1. Wait for Amplify domain status to flip to `AVAILABLE` (typically 10–60
   min after the records propagate). Certificate is issued automatically.
2. Update Amplify env var `NEXTAUTH_URL` from
   `https://main.d1wxabrgr6nkub.amplifyapp.com` to `https://meritia.org`
   and set `CANDIDATE_URL_BASE=https://assess.meritia.org` once the
   candidate subdomain is verified. Redeploy.
3. Smoke test admin: visit `https://meritia.org/login`, sign in as
   `mattvalente85@gmail.com`, confirm redirect to `/admin/recruitment`.
4. Smoke test redirect: `curl -I https://meritia.net` should return 301
   with `location: https://meritia.org/`.
5. Smoke test candidate host: create a test cohort, export the CSV,
   confirm `assessment_url` values point at `https://assess.meritia.org/...`.
   Open one in an incognito window and confirm the assessment loads.

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
- `scripts/wire-cognito-to-domain.sh <domain-url> <amplify-url>` — add both to Cognito's allowed lists. Already run with `https://meritia.org`.

## Change log

- `2026-04-17`: initial provisioning (Cognito, RDS, Amplify, schema push, both domains attached).
