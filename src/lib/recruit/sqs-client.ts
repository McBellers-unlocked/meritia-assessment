/**
 * Tiny SQS client wrapper used by the from-JD generation kick-off
 * endpoint to dispatch a job to the worker Lambda.
 *
 * Lazy-initialised so cold starts on routes that don't enqueue jobs
 * (basically everything outside `/api/admin/recruitment/scenarios/from-jd/generate-task`)
 * don't pay the AWS SDK init cost.
 *
 * Note on the hardcoded fallback: Amplify Hosting Compute is meant to
 * forward app/branch env vars to the SSR runtime, but in practice the
 * propagation seems flaky for newly added vars (existing vars work,
 * new ones intermittently do not). Until we work out why, the queue
 * URL is hardcoded here — it's already public-ish (just an SQS ARN
 * any caller would still need our compute role's IAM credentials to
 * actually publish to), and identical across deployments anyway.
 */
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const FALLBACK_QUEUE_URL =
  "https://sqs.eu-west-1.amazonaws.com/891612540396/meritia-task-generation-queue";
const FALLBACK_REGION = "eu-west-1";

let cachedClient: SQSClient | null = null;

function getClient(): SQSClient {
  if (cachedClient) return cachedClient;
  cachedClient = new SQSClient({
    region:
      process.env.APP_REGION ||
      process.env.AWS_REGION ||
      FALLBACK_REGION,
  });
  return cachedClient;
}

export async function enqueueGenerationJob(jobId: string): Promise<void> {
  const queueUrl = process.env.SQS_TASK_QUEUE_URL || FALLBACK_QUEUE_URL;
  await getClient().send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify({ jobId }),
    })
  );
}
