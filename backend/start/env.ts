/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| temporary instance is enough for validation and providing type-safe
| access to the environment variables.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  APP_KEY: Env.schema.string(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string.optional(),

  /*
  |--------------------------------------------------------------------------
  | Database variables
  |--------------------------------------------------------------------------
  */
  DB_HOST: Env.schema.string({ format: 'host' }),
  DB_PORT: Env.schema.number(),
  DB_USER: Env.schema.string(),
  DB_PASSWORD: Env.schema.string.optional(),
  DB_DATABASE: Env.schema.string(),

  /*
  |--------------------------------------------------------------------------
  | CDN / Storage variables
  |--------------------------------------------------------------------------
  */
  CDN_BASE_URL: Env.schema.string.optional(),

  /*
  |--------------------------------------------------------------------------
  | Bedrock (AI) variables
  |--------------------------------------------------------------------------
  */
  BEDROCK_MODEL_ID: Env.schema.string.optional(),
  BEDROCK_REGION: Env.schema.string.optional(),
  BEDROCK_TIMEOUT_MS: Env.schema.string.optional(),
})
