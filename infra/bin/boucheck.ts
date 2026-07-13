#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { DatabaseStack } from '../lib/database-stack';
import { StorageStack } from '../lib/storage-stack';

const app = new cdk.App();
const env: cdk.Environment = { region: 'sa-east-1' };

const network = new NetworkStack(app, 'BoucheckNetworkStack', { env });

const database = new DatabaseStack(app, 'BoucheckDatabaseStack', {
  env,
  vpc: network.vpc,
  rdsSg: network.rdsSg,
});

const storage = new StorageStack(app, 'BoucheckStorageStack', { env });

app.synth();
