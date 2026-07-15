/*
|--------------------------------------------------------------------------
| SQS Worker — Local Development Polling Consumer
|--------------------------------------------------------------------------
|
| This script polls the SQS Reporting_Queue and processes messages locally,
| replicating the behavior of the Lambda/consumer in production.
|
| Usage:
|   npm run worker
|   # or directly:
|   npx tsx bin/worker.ts
|
| Requires:
|   - AWS credentials configured (~/.aws/credentials or env vars)
|   - SQS_REPORTING_QUEUE_URL set in .env
|   - Database running and accessible
|
*/

import 'reflect-metadata'
import { Ignitor, prettyPrintError } from '@adonisjs/core'
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs'

const APP_ROOT = new URL('../', import.meta.url)

const IMPORTER = (filePath: string) => {
  if (filePath.startsWith('./') || filePath.startsWith('../')) {
    return import(new URL(filePath, APP_ROOT).href)
  }
  return import(filePath)
}

const POLL_INTERVAL_MS = 5_000 // 5 seconds between empty polls
const WAIT_TIME_SECONDS = 20 // SQS long-polling (max 20s)
const MAX_MESSAGES = 10

async function main() {
  // Boot AdonisJS app (loads providers, DB connection, models, etc.)
  const ignitor = new Ignitor(APP_ROOT, { importer: IMPORTER })
  ignitor.tap((application) => {
    application.booting(async () => {
      await import('@adonisjs/core/providers/app_provider')
    })
  })

  const app = ignitor.createApp('console')
  await app.init()
  await app.boot()
  await app.start(() => {})

  const queueUrl = process.env.SQS_REPORTING_QUEUE_URL
  const region = process.env.AWS_REGION ?? 'us-east-1'

  if (!queueUrl) {
    console.error('❌ SQS_REPORTING_QUEUE_URL is not set in .env')
    process.exit(1)
  }

  console.log('──────────────────────────────────────────────')
  console.log('🚀 BouCheck SQS Worker (local development)')
  console.log(`   Queue: ${queueUrl}`)
  console.log(`   Region: ${region}`)
  console.log(`   Poll interval: ${POLL_INTERVAL_MS}ms`)
  console.log(`   Long-poll wait: ${WAIT_TIME_SECONDS}s`)
  console.log('──────────────────────────────────────────────')
  console.log('Listening for messages... (Ctrl+C to stop)\n')

  const sqs = new SQSClient({ region })

  // Import the dispatcher after app boot so models/services resolve correctly
  const { processRecords } = await import('../app/jobs/reporting_worker.js')

  // Graceful shutdown
  let running = true
  const shutdown = async () => {
    console.log('\n🛑 Shutting down worker...')
    running = false
    await ignitor.terminate()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  // Poll loop
  while (running) {
    try {
      const response = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: MAX_MESSAGES,
          WaitTimeSeconds: WAIT_TIME_SECONDS,
          AttributeNames: ['ApproximateReceiveCount' as any],
        })
      )

      const messages = response.Messages ?? []

      if (messages.length === 0) {
        continue // Long-poll returned empty, loop again
      }

      console.log(`📨 Received ${messages.length} message(s)`)

      // Convert SQS messages to the SqsRecord format expected by processRecords
      const records = messages.map((msg) => ({
        body: msg.Body ?? '{}',
        attributes: {
          ApproximateReceiveCount:
            msg.Attributes?.ApproximateReceiveCount ?? '1',
        },
        messageId: msg.MessageId ?? '',
        receiptHandle: msg.ReceiptHandle ?? '',
      }))

      const result = await processRecords(records)

      // Delete successfully processed messages from the queue
      const failedIds = new Set(
        result.batchItemFailures.map((f) => f.itemIdentifier)
      )

      for (const msg of messages) {
        if (!failedIds.has(msg.MessageId ?? '')) {
          await sqs.send(
            new DeleteMessageCommand({
              QueueUrl: queueUrl,
              ReceiptHandle: msg.ReceiptHandle!,
            })
          )
          console.log(`  ✅ Processed & deleted: ${msg.MessageId}`)
        } else {
          console.log(`  ⚠️  Failed (will retry): ${msg.MessageId}`)
        }
      }
    } catch (err) {
      console.error('❌ Poll error:', err)
      // Wait before retrying to avoid tight error loops
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }
  }
}

main().catch((error) => {
  process.exitCode = 1
  prettyPrintError(error)
})
