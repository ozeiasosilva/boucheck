import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface DatabaseStackProps extends StackProps {
  readonly vpc: ec2.IVpc;
  readonly rdsSg: ec2.ISecurityGroup;
}

export class DatabaseStack extends Stack {
  public readonly dbInstance: rds.DatabaseInstance;
  public readonly dbSecret: secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    // RDS PostgreSQL 16 instance (Req 11.3, 11.4, 11.5, 11.6)
    this.dbInstance = new rds.DatabaseInstance(this, 'BoucheckDb', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MICRO,
      ),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [props.rdsSg],
      multiAz: false,
      publiclyAccessible: false,
      backupRetention: Duration.days(7),
      credentials: rds.Credentials.fromGeneratedSecret('boucheck_admin'),
      databaseName: 'boucheck',
    });

    // Expose the generated secret for use by other stacks
    this.dbSecret = this.dbInstance.secret!;
  }
}
