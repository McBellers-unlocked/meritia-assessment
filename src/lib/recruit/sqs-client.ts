/**
 * Tiny SQS client wrapper used by the from-JD generation kick-off
 * endpoint to dispatch a job to the worker Lambda.
 *
 * Lazy-initialised so cold starts on routes that don't enqueue jobs
 * (basically everything outside `/api/admin/recruitment/scenarios/from-jd/generate-task`)
 * don't pay the AWS SDK init cost.
 */
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

let cachedClient: SQSClient | null = null;

function getClient(): SQSClient {
  if (cachedClient) return cachedClient;
  cachedClient = new SQSClient({
    region:
      process.env.APP_REGION ||
      process.env.AWS_REGION ||
      "eu-west-1",
  });
  return cachedClient;
}

export async function enqueueGenerationJob(jobId: string): Promise<void> {
  const queueUrl = process.env.SQS_TASK_QUEUE_URL;
  if (!queueUrl) {
    throw new Error(
      "SQS_TASK_QUEUE_URL env var is not set — task generation queue is not configured."
    );
  }
  await getClient().send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify({ jobId }),
    })
  );
}
