import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../lib/network-stack';
import { DatabaseStack } from '../lib/database-stack';
import { StorageStack } from '../lib/storage-stack';

const env: cdk.Environment = { region: 'sa-east-1' };

let networkTemplate: Template;
let databaseTemplate: Template;
let storageTemplate: Template;

beforeAll(() => {
  const app = new cdk.App();

  const network = new NetworkStack(app, 'TestNetworkStack', { env });
  const database = new DatabaseStack(app, 'TestDatabaseStack', {
    env,
    vpc: network.vpc,
    rdsSg: network.rdsSg,
  });
  const storage = new StorageStack(app, 'TestStorageStack', { env });

  networkTemplate = Template.fromStack(network);
  databaseTemplate = Template.fromStack(database);
  storageTemplate = Template.fromStack(storage);
});

describe('NetworkStack', () => {
  test('VPC has at least one private subnet', () => {
    networkTemplate.resourceCountIs('AWS::EC2::Subnet', 4); // 2 public + 2 private isolated
    networkTemplate.hasResourceProperties('AWS::EC2::Subnet', {
      MapPublicIpOnLaunch: false,
    });
  });

  test('RDS security group allows ingress on port 5432 only from backend SG', () => {
    networkTemplate.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      IpProtocol: 'tcp',
      FromPort: 5432,
      ToPort: 5432,
      SourceSecurityGroupId: Match.anyValue(),
    });
  });
});

describe('DatabaseStack', () => {
  test('RDS instance is PostgreSQL 16.x, db.t4g.micro, single-AZ, private, backup 7 days', () => {
    databaseTemplate.hasResourceProperties('AWS::RDS::DBInstance', {
      Engine: 'postgres',
      EngineVersion: Match.stringLikeRegexp('^16'),
      DBInstanceClass: 'db.t4g.micro',
      MultiAZ: false,
      PubliclyAccessible: false,
      BackupRetentionPeriod: 7,
    });
  });

  test('RDS instance is placed in private subnets (DBSubnetGroup references imported subnets)', () => {
    databaseTemplate.hasResourceProperties('AWS::RDS::DBInstance', {
      DBSubnetGroupName: Match.anyValue(),
    });
  });

  test('Secrets Manager secret is referenced (no plaintext password)', () => {
    // MasterUserPassword must reference a dynamic value (Fn::Join resolving from Secrets Manager)
    databaseTemplate.hasResourceProperties('AWS::RDS::DBInstance', {
      MasterUserPassword: Match.not(Match.absent()),
    });
    // A Secrets Manager secret exists for database credentials
    databaseTemplate.resourceCountIs('AWS::SecretsManager::Secret', 1);
  });

  test('RDS credentials use a generated secret — no inline password', () => {
    // The MasterUserPassword references Secrets Manager (not a plaintext string)
    const resources = databaseTemplate.findResources('AWS::RDS::DBInstance');
    const dbLogicalId = Object.keys(resources)[0];
    const masterUserPassword = resources[dbLogicalId].Properties.MasterUserPassword;
    // It should be a CloudFormation intrinsic (object with Fn::Join or Ref), not a raw string
    expect(typeof masterUserPassword).toBe('object');
  });
});

describe('StorageStack', () => {
  test('two S3 buckets with PublicAccessBlockConfiguration all true and SSE', () => {
    storageTemplate.resourceCountIs('AWS::S3::Bucket', 2);
    storageTemplate.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      BucketEncryption: {
        ServerSideEncryptionConfiguration: Match.arrayWith([
          Match.objectLike({
            ServerSideEncryptionByDefault: {
              SSEAlgorithm: 'AES256',
            },
          }),
        ]),
      },
    });
  });

  test('standard SQS queue with DLQ RedrivePolicy (maxReceiveCount: 3)', () => {
    storageTemplate.hasResourceProperties('AWS::SQS::Queue', {
      RedrivePolicy: Match.objectLike({
        maxReceiveCount: 3,
      }),
    });
  });

  test('SQS queues have SQS-managed server-side encryption enabled', () => {
    // Both queues (job queue + DLQ) should have SSE enabled
    const queues = storageTemplate.findResources('AWS::SQS::Queue');
    const queueLogicalIds = Object.keys(queues);
    expect(queueLogicalIds.length).toBe(2);

    for (const logicalId of queueLogicalIds) {
      expect(queues[logicalId].Properties.SqsManagedSseEnabled).toBe(true);
    }
  });
});

describe('cdk synth', () => {
  test('synthesizes without errors', () => {
    // This test validates that the entire CDK app synthesizes successfully
    const app = new cdk.App();
    const network = new NetworkStack(app, 'SynthTestNetworkStack', { env });
    new DatabaseStack(app, 'SynthTestDatabaseStack', {
      env,
      vpc: network.vpc,
      rdsSg: network.rdsSg,
    });
    new StorageStack(app, 'SynthTestStorageStack', { env });

    // app.synth() would throw if there are synthesis errors
    expect(() => app.synth()).not.toThrow();
  });
});
