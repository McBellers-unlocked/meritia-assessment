# meritia-task-generator (worker Lambda)

Background worker for the JD-to-scenario task generator. Triggered by SQS messages from the Amplify SSR endpoint at `POST /api/admin/recruitment/scenarios/from-jd/generate-task`.

## Why this exists

Amplify Hosting's SSR Lambda has a fixed ~30-second timeout. Multi-criteria task generation with Claude Opus 4.7 + adaptive thinking can take 30–60 seconds. Running the call here (Lambda timeout 5 minutes, in eu-west-1) escapes that ceiling.

## How it fits

```
Wizard → SSR /generate-task ──┬─► insert RecruitmentScenarioGenerationJob row (queued)
                              └─► SQS send → meritia-task-generation-queue
                                                      │
                                                      ▼
                                        meritia-task-generator (this)
                                                      │
                                                      ├─► UPDATE row status=running
                                                      ├─► Anthropic Opus 4.7 call
                                                      └─► UPDATE row status=completed (+ result_json)

Wizard → SSR /generate-task/[jobId]   (poll every 2s until completed/failed)
```

## Files

| File | Purpose |
|---|---|
| `index.mjs` | SQS handler. One message = one job. Reads input from DB, calls Anthropic, writes result back. |
| `prompt.mjs` | System prompt + `propose_task` tool definition. **Mirrors `src/lib/recruit/scenario-generator.ts` — keep in sync.** |
| `package.json` | Just `@anthropic-ai/sdk` and `pg`. |
| `build.sh` | Installs deps, produces `../task-generator.zip`. Pass `--update` to push to AWS. |

## Environment variables

Set on the Lambda (eu-west-1, function name `meritia-task-generator`):

- `ANTHROPIC_API_KEY` — Anthropic API key
- `DATABASE_URL` — Postgres connection string (must include `sslmode=require` for RDS)

## Re-deploy after a code change

```bash
cd lambda/task-generator
./build.sh --update
```

Or split it:

```bash
./build.sh                                      # produces task-generator.zip
aws lambda update-function-code \
  --function-name meritia-task-generator \
  --zip-file fileb://../task-generator.zip \
  --region eu-west-1
```

## One-off provisioning (already done; included for reference)

```bash
# 1. SQS queue
aws sqs create-queue \
  --queue-name meritia-task-generation-queue \
  --attributes VisibilityTimeout=360,MessageRetentionPeriod=1209600 \
  --region eu-west-1

# 2. IAM role for the Lambda (trust policy: lambda.amazonaws.com)
aws iam create-role \
  --role-name meritia-task-generator-lambda-role \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

aws iam attach-role-policy \
  --role-name meritia-task-generator-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

aws iam put-role-policy \
  --role-name meritia-task-generator-lambda-role \
  --policy-name sqs-receive \
  --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["sqs:ReceiveMessage","sqs:DeleteMessage","sqs:GetQueueAttributes"],"Resource":"<queue-arn>"}]}'

# 3. Create the Lambda function
./build.sh
aws lambda create-function \
  --function-name meritia-task-generator \
  --runtime nodejs20.x \
  --role arn:aws:iam::<account>:role/meritia-task-generator-lambda-role \
  --handler index.handler \
  --memory-size 1024 \
  --timeout 300 \
  --zip-file fileb://../task-generator.zip \
  --environment "Variables={ANTHROPIC_API_KEY=<key>,DATABASE_URL=<dburl>}" \
  --region eu-west-1

# 4. Wire SQS → Lambda
aws lambda create-event-source-mapping \
  --function-name meritia-task-generator \
  --event-source-arn <queue-arn> \
  --batch-size 1 \
  --region eu-west-1
```

## Observability

- CloudWatch Logs: `/aws/lambda/meritia-task-generator`
- DB query: `SELECT id, status, enqueued_at, started_at, completed_at, error_message FROM recruitment_scenario_generation_jobs ORDER BY enqueued_at DESC LIMIT 20;`
- SQS console: queue depth should stay near 0; messages-in-flight = active workers.

## Known migration debt

- **Prompt drift**: `prompt.mjs` here vs `src/lib/recruit/scenario-generator.ts` in the Next.js app must stay in sync. The two have a sync-warning comment at the top of each. Future cleanup: pull into a workspace-shared package.
- **No retry policy**: SQS max-receive-count is 1 — a transient Anthropic 5xx kills the job and the user has to click Regenerate. Consider 1–2 retries if we see them in CloudWatch.
- **Job table grows forever**: add a daily cron or TTL once it exceeds ~10K rows.
