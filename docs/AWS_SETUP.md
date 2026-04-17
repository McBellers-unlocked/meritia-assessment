# Meritia — AWS setup guide

Click-by-click guide for standing up a new Meritia deployment on AWS. Designed
to be read alongside the AWS Management Console.

**What you are building:** a Next.js app on AWS Amplify, backed by an RDS
PostgreSQL database, with Cognito for admin sign-in, and an Anthropic API key
held in Amplify's environment configuration.

**Time:** ~60–90 minutes once you have the prerequisites.

**Monthly cost (pilot):** ~$35–65. RDS `db.t3.micro` free tier for 12 months;
Amplify free tier covers low SSR traffic; Cognito free tier covers up to 50 000
monthly active users; Anthropic is pay-per-token.

**Prerequisites:**
- AWS account with admin access
- GitHub access to `McBellers-unlocked/meritia-assessment`
- Anthropic API key from `https://console.anthropic.com`
- A domain name (optional for pilot; can be added later without redeploy)

**Companion documents:**
- `docs/MIGRATION_PLAN.md` — what was carved from Callater and why
- `README.md` — local setup, env vars, golden-path manual tests
- `C:\Users\Matt\.claude\plans\this-is-the-git-abstract-flask.md` — concise execution plan

---

## Step 0 — Anthropic API key

Before touching AWS, grab your key:

1. Go to <https://console.anthropic.com> → sign in.
2. **Settings → API Keys → Create Key**. Name it `meritia-production`.
3. Copy the key now. Anthropic never shows it again. Paste it into a temporary
   note — you will put it in Amplify in Step 3.
4. **Settings → Billing** — add a payment method and $20 initial credit.

---

## Step 1 — Pick a region and stick to it

All AWS resources must be in the same region. Recommended: **eu-west-1
(Ireland)** — same as Callater, GDPR-friendly.

In the AWS Console top-right region selector: set to **EU (Ireland) eu-west-1**
before every subsequent step.

---

## Step 2 — Create the RDS PostgreSQL database

### 2.1 Navigate to RDS

1. Console top search bar: `RDS` → click **RDS**.
2. Verify region is `eu-west-1` (top-right).

### 2.2 Create database

1. **Create database**.
2. **Standard create**.
3. **Engine options:**
   - Engine type: **PostgreSQL**
   - Engine version: latest **PostgreSQL 16.x**
4. **Templates:** **Free tier** (selects `db.t3.micro`; fine for pilot).

### 2.3 Settings

| Field | Value |
|-------|-------|
| DB instance identifier | `meritia-db` |
| Master username | `meritia_admin` |
| Credentials management | Self managed |
| Master password | choose something strong; record it securely |
| Confirm password | re-enter |

### 2.4 Instance configuration

Auto-set to **db.t3.micro** by the Free tier template. Leave it.

### 2.5 Storage

| Field | Value |
|-------|-------|
| Storage type | General Purpose SSD (gp2) |
| Allocated storage | 20 GB |
| Storage autoscaling | **Uncheck** (keeps costs predictable) |

### 2.6 Connectivity

| Field | Value |
|-------|-------|
| Compute resource | Don't connect to an EC2 compute resource |
| Network type | IPv4 |
| VPC | Default VPC |
| DB subnet group | Default |
| Public access | **Yes** (required — Amplify SSR connects over the public endpoint) |
| VPC security group | Create new |
| New security group name | `meritia-db-sg` |
| Availability Zone | No preference |

### 2.7 Database authentication

Select **Password authentication** (no IAM auth).

### 2.8 Additional configuration (expand the accordion)

| Field | Value |
|-------|-------|
| Initial database name | `meritia` |
| Enable automated backups | Yes (default) |
| Backup retention | 7 days |
| Enable encryption | Yes (default KMS) |

### 2.9 Create and wait

1. Click **Create database**. Takes 5–10 minutes.
2. Wait for **Available** status.
3. Open the DB instance page.
4. Record:
   - **Endpoint** (looks like `meritia-db.xxxxxxxxxxxx.eu-west-1.rds.amazonaws.com`)
   - **Port**: `5432`

### 2.10 Open the security group

Amplify SSR runs outside your VPC and needs to reach RDS over 5432:

1. On the RDS instance page → **Connectivity & security** → click the
   `meritia-db-sg` security group link.
2. **Inbound rules** tab → **Edit inbound rules**.
3. Existing rule: Type **PostgreSQL**, Port **5432**.
4. Change **Source** to **Anywhere-IPv4 (0.0.0.0/0)**.
5. **Save rules**.

Security note: the DB is password-protected, encrypted at rest, and requires
SSL (`sslmode=require` in the connection string). For production, tighten this
rule to Amplify's egress CIDR or put RDS in a private subnet with a Lambda
proxy — see `docs/MIGRATION_PLAN.md` "Not in scope / follow-ups".

---

## Step 3 — Set up Cognito user pool

Meritia admins sign in via Cognito. Candidates do **not** — they use a token
URL. So the user pool only holds recruiters and markers.

### 3.1 Navigate to Cognito

Console search → `Cognito` → **Amazon Cognito** → **Create user pool**.

### 3.2 Configure sign-in experience

- **Provider types:** Cognito user pool.
- **Sign-in options:** check **Email**.
- **Next**.

### 3.3 Configure security requirements

| Field | Value |
|-------|-------|
| Password policy mode | Custom |
| Password minimum length | 12 |
| Password requirements | Check Uppercase, Lowercase, Numbers. Uncheck Special characters (optional). |
| Multi-factor authentication | Optional MFA (recommended) |
| MFA methods | Authenticator apps |
| User account recovery | Email only |

**Next**.

### 3.4 Configure sign-up experience

**This is where Meritia differs from Callater.** Callater enabled
self-registration for candidates. Meritia admins are invite-only.

| Field | Value |
|-------|-------|
| Self-registration | **Disable** |
| Attribute verification | Send email message, verify email address |
| Required attributes | email |
| Custom attributes | **Skip** — do NOT add a `role` attribute (Meritia does not use it) |

**Next**.

### 3.5 Configure message delivery

| Field | Value |
|-------|-------|
| Email provider | Send email with Cognito (fine for pilot) |
| FROM email | Default (`no-reply@verificationemail.com`) |

**Next**.

### 3.6 Integrate your app

| Field | Value |
|-------|-------|
| User pool name | `meritia-users` |
| Hosted authentication pages | **Check** Use the Cognito Hosted UI |
| Domain type | Use a Cognito domain |
| Cognito domain prefix | `meritia` (gives `https://meritia.auth.eu-west-1.amazoncognito.com`) |

**Initial app client:**

| Field | Value |
|-------|-------|
| App type | **Public client** |
| App client name | `meritia-web` |
| Client secret | **Don't generate a client secret** (public client with PKCE) |
| Allowed callback URLs | `http://localhost:3000/api/auth/callback/cognito` (the production URL is added in Step 5) |
| Allowed sign-out URLs | `http://localhost:3000` |

**Next** → **Review** → **Create user pool**.

### 3.7 Record the IDs

Once created, inside the pool note down:

- **User Pool ID** (e.g. `eu-west-1_xxxxxxxxx`) — from the overview page
- **App client ID** (from **App integration → App clients → meritia-web**)

### 3.8 Create the admin group

1. **Groups** tab → **Create group**.
2. Group name: `admin`. Description: `Meritia administrators`.
3. **Create group**.

(Callater had additional `examiner` and `student` groups — Meritia does NOT
need them.)

### 3.9 Create your admin user

1. **Users** tab → **Create user**.
2. Email: your work email. Temporary password: choose one (you'll be prompted
   to change it on first sign-in).
3. Create user.
4. Open the user → **Groups** tab → **Add user to group** → select `admin`.

This account is the first Meritia admin. Every subsequent admin is created
the same way by an existing admin.

---

## Step 4 — Create the Amplify app

### 4.1 Navigate to Amplify

Console search → `Amplify` → **AWS Amplify** → **Create new app**.

### 4.2 Connect GitHub

1. **GitHub** → **Next**.
2. **Authorise AWS Amplify** → grant access to `McBellers-unlocked`.
3. Repository: `McBellers-unlocked/meritia-assessment`.
4. Branch: `main`.
5. **Next**.

### 4.3 Build settings

Amplify should auto-detect Next.js (SSR). Verify:

| Field | Value |
|-------|-------|
| App name | `meritia` |
| Framework detected | Next.js - SSR |
| Build command | `npm run build` (already runs `prisma generate && next build`) |
| Build output directory | `.next` |

No `amplify.yml` is needed. Leave the build spec as auto-generated.

### 4.4 Environment variables

**Advanced settings → Environment variables**. Add these six — nothing else:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `postgresql://meritia_admin:<PWD>@<RDS-ENDPOINT>:5432/meritia?sslmode=require` |
| `NEXTAUTH_URL` | **Leave blank for now** — set after first deploy gives you the Amplify URL |
| `NEXTAUTH_SECRET` | Generate locally: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Paste the output. |
| `COGNITO_CLIENT_ID` | App client ID from Step 3.7 |
| `COGNITO_ISSUER` | `https://cognito-idp.eu-west-1.amazonaws.com/<USER-POOL-ID>` |
| `ANTHROPIC_API_KEY` | From Step 0 |

**Notes:**
- Do **not** use `AWS_REGION` or `AWS_REGION_NAME` as an env var name — Amplify reserves the `AWS_` prefix and will reject them. Meritia does not need a region env var with this configuration.
- Meritia's `src/lib/secrets.ts` prefers `ANTHROPIC_API_KEY` over `SECRET_ARN` — you don't need `SECRET_ARN` or any Secrets Manager setup.

### 4.5 Service role

Accept Amplify's default service role. Because the Anthropic key is in the
env vars directly, Meritia does not need `secretsmanager:GetSecretValue`
permissions. (Callater needed this — Meritia does not.)

### 4.6 Save and deploy

1. **Save and deploy**.
2. First build takes 3–6 minutes.
3. Success: an Amplify-provided URL like `https://main.xxxxxxxxxxxx.amplifyapp.com`.

### 4.7 Set `NEXTAUTH_URL`

1. **Hosting → Environment variables** (or **App settings → Environment variables** depending on console version).
2. Set `NEXTAUTH_URL` to the Amplify URL from 4.6 (exact string, including `https://`, no trailing slash).
3. **Save** → **Redeploy this version** from the branch menu (env var changes require a rebuild to take effect in the SSR bundle).

---

## Step 5 — Push schema to the database

This runs once, from **your local machine**, against the production DB.

### 5.1 Clone the repo if you have not already

```bash
cd C:/dev
git clone https://github.com/McBellers-unlocked/meritia-assessment meritia-remote
cd meritia-remote
npm install
```

(If you already have `C:/dev/meritia` locally and it is up to date, use that
instead.)

### 5.2 Temporarily point the local env at prod

Create `.env.local` with the production `DATABASE_URL`:

```
DATABASE_URL=postgresql://meritia_admin:<PWD>@<RDS-ENDPOINT>:5432/meritia?sslmode=require
```

### 5.3 Apply the schema

```bash
npx prisma db push
```

This creates all the `recruitment_*` tables plus the minimal `User` table.
No migrations are versioned — the schema lives in `prisma/schema.prisma` and
`db push` applies it directly. For a pilot that's fine; add migrations later
if you need zero-downtime upgrades.

### 5.4 Delete `.env.local` or revert

Do not keep the prod `DATABASE_URL` in a file that could accidentally be
committed. `.gitignore` already covers `.env*.local`, but clean up anyway.

---

## Step 6 — Wire Cognito callback URLs to the deployed app

Cognito only allows sign-in callbacks from URLs you explicitly list.

1. **Cognito → User pools → meritia-users → App integration → App clients → meritia-web → Edit hosted UI**.
2. **Allowed callback URLs**: add `https://<AMPLIFY-URL>/api/auth/callback/cognito`. Keep the `http://localhost:3000/api/auth/callback/cognito` entry — that is your local dev callback.
3. **Allowed sign-out URLs**: add `https://<AMPLIFY-URL>`. Keep the localhost entry.
4. **Save changes**.

---

## Step 7 — Verify end to end

Smoke tests against the deployed URL. Full test script lives in `README.md`
under "Golden-path manual test".

### A. Admin sign-in

- [ ] `https://<AMPLIFY-URL>/login` renders a minimal "Sign in to Meritia" card.
- [ ] Click **Continue with single sign-on** → redirects to Cognito Hosted UI.
- [ ] Sign in with the admin user from Step 3.9. Cognito forces a password change on first sign-in (set one).
- [ ] Redirects back to `https://<AMPLIFY-URL>/admin/recruitment`.

If this fails, the likely suspects are:
- `COGNITO_ISSUER` wrong (double-check the user-pool-id segment)
- Callback URL not added in Step 6
- `NEXTAUTH_URL` does not exactly match the current Amplify URL

### B. Create a cohort and candidate

- [ ] Admin page → **Create new assessment**.
- [ ] Title: `Meritia smoke test`. Scenario: `Finance and Accounting Manager (P4) — IDSC (built-in)`. Open date: now. Close date: in 7 days. Total minutes: 90.
- [ ] **Create assessment** → redirects to the assessment dashboard.
- [ ] **Manage candidates & URLs** → paste `Smoke Test, smoke@example.com` → **Add candidates**.
- [ ] Copy the candidate URL (e.g. `https://<AMPLIFY-URL>/assess/fam-p4?token=FAM-XXXX`).

### C. Candidate flow

- [ ] Open the candidate URL in an **incognito** window.
- [ ] Landing shows: organisation "International Digital Services Centre (IDSC), Geneva", position "Finance and Accounting Manager (P4)", duration 90 min.
- [ ] Tick the acknowledgement → **Begin assessment** → timer starts counting down.
- [ ] Task 1 exhibit pane shows the financial statements HTML (if blank: `outputFileTracingIncludes` did not ship the file — see Troubleshooting below).
- [ ] Open the investigation chat drawer (Ctrl+J or the right-side rail). Ask "What's the intangibles balance?". A Claude reply lands within ~5 s (if it errors: `ANTHROPIC_API_KEY` env var is wrong or the Amplify SSR Lambda timeout is below 60 s).
- [ ] Type a short memo. Switch to Task 2. Type something. **Submit assessment** → confirmation dialog → confirm.
- [ ] Submitted view shows "Thank you".

### D. Admin marks the submission

- [ ] Back in admin → assessment dashboard → **Mark submissions** (count now 1).
- [ ] Open the candidate row → memo + AI trail render side-by-side.
- [ ] Enter a score + comment → **Save**.
- [ ] **Results & ranking** → row shows a total score.

### E. Single-use enforcement

- [ ] Re-open the same candidate URL in a **different** browser (no shared cookies with the first one).
- [ ] **Begin** must fail with "This assessment has already been started in another browser session."

---

## Step 8 — Custom domain (when you're ready)

1. **Amplify → Hosting → Custom domains → Add domain** → enter `<YOUR-DOMAIN>`.
2. Amplify shows two DNS records:
   - A CNAME at `_amplify_<random>.<domain>` for ownership verification.
   - An ALIAS (or CNAME) at the apex / subdomain pointing to Amplify's load balancer.
3. At your DNS host (Route 53 / GoDaddy / Cloudflare / wherever) add those records. If the DNS is in Route 53 for the same account, Amplify can write them automatically.
4. Wait for SSL: ACM issues the cert once DNS resolves; typically 10–30 minutes, occasionally a few hours.
5. Back in Cognito (Step 3.6 / Step 6):
   - **Allowed callback URLs**: add `https://<YOUR-DOMAIN>/api/auth/callback/cognito`.
   - **Allowed sign-out URLs**: add `https://<YOUR-DOMAIN>`.
6. Back in Amplify environment variables:
   - `NEXTAUTH_URL` = `https://<YOUR-DOMAIN>`. Redeploy to pick up the change.

---

## Troubleshooting

**Exhibit pane is blank on the candidate view.**
The HTML in `infra/recruit/idsc-fam-p4-2026/task1_exhibit.html` is loaded at
runtime via `readFileSync(process.cwd() + …)`. `next.config.mjs` has
`outputFileTracingIncludes` set for both `/api/**` and `/assess/**` to include
`infra/recruit/**`. If the pane is blank, open the Amplify build logs and
check for a warning from the scenario loader (`[recruit] failed to load
task1_exhibit.html …`). Fix by widening the `outputFileTracingIncludes` glob
or copying the files into `public/` (less elegant but bulletproof).

**Chat replies return 500 after ~60 seconds.**
Amplify SSR Lambda timeout may be below 60 s. `src/app/api/assess/chat/route.ts`
sets `export const maxDuration = 60`. In Amplify, check **Hosting → Compute
settings → Edge / SSR function timeout** and bump to 60 s.

**`prisma db push` fails with SSL error.**
Append `?sslmode=require` to `DATABASE_URL`. RDS rejects non-SSL connections
when encryption is enabled (our setting).

**Candidate URL 404s.**
Confirm the cohort is within its open/close window. `loadCandidate()` in
`src/lib/recruit/candidate-auth.ts` returns 410 for candidates still in status
"invited" when the assessment window has closed.

**Sign-in loops back to `/login`.**
Usually a mismatch between `NEXTAUTH_URL` and the actual request origin, or
the Cognito callback URL is not listed. Check both.

---

## Cost notes

Ballpark for a pilot carrying ~30 candidates × 2 tasks × 90 min:

| Service | Cost |
|---------|------|
| RDS `db.t3.micro` | Free for 12 months; then ~$14/mo |
| Amplify hosting | Free tier covers low traffic; ~$0.15/GB served beyond |
| Cognito | Free up to 50 000 MAU |
| Anthropic API (Claude Sonnet 4.x) | ~$3/1M input tokens with prompt caching; per-candidate cost is roughly $0.30–1.00 for a 90-min investigation depending on depth |
| Data transfer | Negligible at pilot scale |

Total for a 30-candidate pilot: $35–65 one-off, ~$14/mo afterwards.
