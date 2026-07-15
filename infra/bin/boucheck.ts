#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { DatabaseStack } from '../lib/database-stack';
import { StorageStack } from '../lib/storage-stack';
import { BackendStack } from '../lib/backend-stack';

const app = new cdk.App();
const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: 'us-east-1',
};

const network = new NetworkStack(app, 'BoucheckNetworkStack', { env });

const database = new DatabaseStack(app, 'BoucheckDatabaseStack', {
  env,
  vpc: network.vpc,
  rdsSg: network.rdsSg,
});

const storage = new StorageStack(app, 'BoucheckStorageStack', { env });

new BackendStack(app, 'BoucheckBackendStack', { env });

app.synth();
