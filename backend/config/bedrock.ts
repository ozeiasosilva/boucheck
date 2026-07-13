import env from '#start/env'

const bedrockConfig = {
  modelId: env.get('BEDROCK_MODEL_ID', 'anthropic.claude-3-5-sonnet-20241022-v2:0'),
  region: env.get('BEDROCK_REGION', 'sa-east-1'),
  timeoutMs: Number(env.get('BEDROCK_TIMEOUT_MS', '60000')),
}

export default bedrockConfig
