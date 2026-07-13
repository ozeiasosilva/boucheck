import { Stack, StackProps } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

export class StorageStack extends Stack {
  public readonly logosBucket: s3.Bucket;
  public readonly reportsBucket: s3.Bucket;
  public readonly deadLetterQueue: sqs.Queue;
  public readonly jobQueue: sqs.Queue;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // S3 bucket for logos (Req 12.1, 12.4)
    this.logosBucket = new s3.Bucket(this, 'LogosBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
    });

    // S3 bucket for reports (Req 12.1, 12.4)
    this.reportsBucket = new s3.Bucket(this, 'ReportsBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
    });

    // SQS dead-letter queue (Req 12.3, 12.4)
    this.deadLetterQueue = new sqs.Queue(this, 'DeadLetterQueue', {
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    // SQS standard queue for async jobs with DLQ redrive (Req 12.2, 12.3, 12.4)
    this.jobQueue = new sqs.Queue(this, 'JobQueue', {
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      deadLetterQueue: {
        queue: this.deadLetterQueue,
        maxReceiveCount: 3,
      },
    });
  }
}
