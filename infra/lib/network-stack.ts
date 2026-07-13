import { Stack, StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class NetworkStack extends Stack {
  public readonly vpc: ec2.Vpc;
  public readonly rdsSg: ec2.SecurityGroup;
  public readonly backendSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // VPC with 2 AZs, public + private isolated subnets (Req 11.2)
    this.vpc = new ec2.Vpc(this, 'BoucheckVpc', {
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'PrivateIsolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    // Security group for RDS — no default ingress (Req 11.6)
    this.rdsSg = new ec2.SecurityGroup(this, 'RdsSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: 'rds-sg',
      description: 'Security group for RDS PostgreSQL — no default ingress',
      allowAllOutbound: false,
    });

    // Security group for backend compute
    this.backendSg = new ec2.SecurityGroup(this, 'BackendSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: 'backend-sg',
      description: 'Security group for backend compute tier',
    });

    // Allow ingress on port 5432 to rds-sg only from backend-sg (Req 11.6)
    this.rdsSg.addIngressRule(
      this.backendSg,
      ec2.Port.tcp(5432),
      'Allow PostgreSQL access from backend security group only',
    );
  }
}
