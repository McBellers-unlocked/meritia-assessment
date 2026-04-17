/**
 * Anthropic API key resolution.
 *
 * Two paths, preferred in this order:
 *   1. `ANTHROPIC_API_KEY` env var — simplest, ideal for local dev and small
 *      deployments.
 *   2. AWS Secrets Manager — required for Amplify-style deployments where the
 *      key lives in a secret. Set `SECRET_ARN` (and `APP_REGION`) and the
 *      secret JSON must include `ANTHROPIC_API_KEY`.
 *
 * The value is cached in-process; serverless cold-start each amortises one
 * Secrets Manager call.
 */
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

let cachedKey: string | null = null;

export async function getAnthropicKey(): Promise<string> {
  if (cachedKey) return cachedKey;

  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey) {
    cachedKey = envKey;
    return cachedKey;
  }

  const arn = process.env.SECRET_ARN;
  if (!arn) {
    throw new Error(
      "Anthropic API key not configured. Set ANTHROPIC_API_KEY or SECRET_ARN."
    );
  }

  const client = new SecretsManagerClient({
    region: process.env.APP_REGION || "eu-west-1",
  });
  const command = new GetSecretValueCommand({ SecretId: arn });
  const response = await client.send(command);
  if (!response.SecretString) {
    throw new Error(`Secret ${arn} has no SecretString`);
  }
  const parsed = JSON.parse(response.SecretString);
  const key = parsed.ANTHROPIC_API_KEY;
  if (!key) throw new Error(`ANTHROPIC_API_KEY missing from secret ${arn}`);
  cachedKey = key;
  return cachedKey!;
}
