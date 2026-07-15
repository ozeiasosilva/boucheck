import { CfnOutput, CfnParameter, Duration, Stack, StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class BackendStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // --- VPC Lookup (uses context, resolved at synth time) ---

    const vpcId = this.node.tryGetContext('vpcId');
    if (!vpcId) {
      throw new Error('Context variable "vpcId" is required. Pass it via -c vpcId=vpc-XXX or set it in cdk.json');
    }

    const vpc = ec2.Vpc.fromLookup(this, 'ImportedVpc', { vpcId });

    // --- Parameters (passed at deploy time) ---

    const appKey = new CfnParameter(this, 'AppKey', {
      type: 'String',
      noEcho: true,
      description: 'AdonisJS APP_KEY',
    });

    const dbHost = new CfnParameter(this, 'DbHost', {
      type: 'String',
      description: 'PostgreSQL host endpoint',
    });

    const dbPort = new CfnParameter(this, 'DbPort', {
      type: 'String',
      default: '5432',
    });

    const dbUser = new CfnParameter(this, 'DbUser', {
      type: 'String',
      default: 'boucheck_admin',
    });

    const dbPassword = new CfnParameter(this, 'DbPassword', {
      type: 'String',
      noEcho: true,
    });

    const dbDatabase = new CfnParameter(this, 'DbDatabase', {
      type: 'String',
      default: 'boucheck',
    });

    const sqsQueueUrl = new CfnParameter(this, 'SqsQueueUrl', {
      type: 'String',
      description: 'SQS Job Queue URL',
    });

    const s3LogosBucket = new CfnParameter(this, 'S3LogosBucket', {
      type: 'String',
      default: 'boucheck-logos',
    });

    const s3ReportsBucket = new CfnParameter(this, 'S3ReportsBucket', {
      type: 'String',
      default: 'boucheck-reports',
    });

    const awsRegion = new CfnParameter(this, 'AwsRegionParam', {
      type: 'String',
      default: 'us-east-1',
    });

    const cdnBaseUrl = new CfnParameter(this, 'CdnBaseUrl', {
      type: 'String',
      default: 'https://cdn.boucheck.beonup.com.br',
    });

    const sesFromEmail = new CfnParameter(this, 'SesFromEmail', {
      type: 'String',
      default: 'contato@beonup.com.br',
    });

    const bedrockModelId = new CfnParameter(this, 'BedrockModelId', {
      type: 'String',
      default: 'us.anthropic.claude-sonnet-4-6',
    });

    const bedrockRegion = new CfnParameter(this, 'BedrockRegion', {
      type: 'String',
      default: 'us-east-1',
    });

    const bedrockTimeoutMs = new CfnParameter(this, 'BedrockTimeoutMs', {
      type: 'String',
      default: '180000',
    });

    const whatsappPhoneNumberId = new CfnParameter(this, 'WhatsappPhoneNumberId', {
      type: 'String',
      default: '',
    });

    const whatsappAccessToken = new CfnParameter(this, 'WhatsappAccessToken', {
      type: 'String',
      noEcho: true,
      default: '',
    });

    const targetGroupArn = new CfnParameter(this, 'TargetGroupArn', {
      type: 'String',
      description: 'ARN of the existing ALB Target Group to register the ECS service with',
    });

    const albSecurityGroupId = new CfnParameter(this, 'AlbSecurityGroupId', {
      type: 'String',
      description: 'Security Group ID of the existing ALB (to allow inbound traffic on port 3333)',
    });

    // --- Security Group for backend ---

    const backendSg = new ec2.SecurityGroup(this, 'BackendSecurityGroup', {
      vpc,
      description: 'Security group for Boucheck backend Fargate tasks',
    });

    // Allow ALB to reach backend on port 3333
    const albSg = ec2.SecurityGroup.fromSecurityGroupId(this, 'AlbSg', albSecurityGroupId.valueAsString);
    backendSg.addIngressRule(albSg, ec2.Port.tcp(3333), 'Allow ALB health checks and traffic');

    // --- ECS Cluster ---

    const cluster = new ecs.Cluster(this, 'BackendCluster', {
      vpc,
      clusterName: 'boucheck-backend',
    });

    // --- Task Role (permissions for S3, SQS, SES, Bedrock) ---

    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          's3:GetObject',
          's3:PutObject',
          's3:DeleteObject',
          's3:ListBucket',
        ],
        resources: [
          `arn:aws:s3:::${s3LogosBucket.valueAsString}`,
          `arn:aws:s3:::${s3LogosBucket.valueAsString}/*`,
          `arn:aws:s3:::${s3ReportsBucket.valueAsString}`,
          `arn:aws:s3:::${s3ReportsBucket.valueAsString}/*`,
        ],
      }),
    );

    taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sqs:SendMessage', 'sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes'],
        resources: ['*'], // scoped by queue URL at runtime
      }),
    );

    taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail', 'ses:SendRawEmail'],
        resources: ['*'],
      }),
    );

    taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: ['*'],
      }),
    );

    // --- Task Definition (smallest Fargate config) ---

    const taskDef = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      cpu: 256, // 0.25 vCPU
      memoryLimitMiB: 512, // 0.5 GB
      taskRole,
    });

    const logGroup = new logs.LogGroup(this, 'BackendLogs', {
      logGroupName: '/ecs/boucheck-backend',
      retention: logs.RetentionDays.TWO_WEEKS,
    });

    taskDef.addContainer('backend', {
      image: ecs.ContainerImage.fromAsset('../backend'),
      portMappings: [{ containerPort: 3333 }],
      environment: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: '3333',
        LOG_LEVEL: 'info',
        APP_KEY: appKey.valueAsString,
        DB_HOST: dbHost.valueAsString,
        DB_PORT: dbPort.valueAsString,
        DB_USER: dbUser.valueAsString,
        DB_PASSWORD: dbPassword.valueAsString,
        DB_DATABASE: dbDatabase.valueAsString,
        SQS_REPORTING_QUEUE_URL: sqsQueueUrl.valueAsString,
        S3_LOGOS_BUCKET: s3LogosBucket.valueAsString,
        S3_REPORTS_BUCKET: s3ReportsBucket.valueAsString,
        AWS_REGION: awsRegion.valueAsString,
        CDN_BASE_URL: cdnBaseUrl.valueAsString,
        SES_FROM_EMAIL: sesFromEmail.valueAsString,
        BEDROCK_MODEL_ID: bedrockModelId.valueAsString,
        BEDROCK_REGION: bedrockRegion.valueAsString,
        BEDROCK_TIMEOUT_MS: bedrockTimeoutMs.valueAsString,
        WHATSAPP_PHONE_NUMBER_ID: whatsappPhoneNumberId.valueAsString,
        WHATSAPP_ACCESS_TOKEN: whatsappAccessToken.valueAsString,
        WHATSAPP_API_VERSION: 'v18.0',
        WHATSAPP_TEMPLATE_NAME: 'report_delivery',
        WHATSAPP_TEMPLATE_LANGUAGE: 'pt_BR',
      },
      logging: ecs.LogDrivers.awsLogs({
        logGroup,
        streamPrefix: 'backend',
      }),
      healthCheck: {
        command: ['CMD-SHELL', 'node -e "fetch(\'http://localhost:3333/health\').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"'],
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        retries: 3,
        startPeriod: Duration.seconds(60),
      },
    });

    // --- Fargate Service (public subnet, public IP, no ALB) ---

    const service = new ecs.FargateService(this, 'BackendService', {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [backendSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    // --- Register with existing ALB Target Group ---

    const tg = elbv2.ApplicationTargetGroup.fromTargetGroupAttributes(this, 'ImportedTg', {
      targetGroupArn: targetGroupArn.valueAsString,
    });

    service.attachToApplicationTargetGroup(tg);

    // --- Worker Service (SQS consumer, no inbound traffic) ---

    const workerTaskDef = new ecs.FargateTaskDefinition(this, 'WorkerTaskDef', {
      cpu: 256,
      memoryLimitMiB: 512,
      taskRole,
    });

    const workerLogGroup = new logs.LogGroup(this, 'WorkerLogs', {
      logGroupName: '/ecs/boucheck-worker',
      retention: logs.RetentionDays.TWO_WEEKS,
    });

    workerTaskDef.addContainer('worker', {
      image: ecs.ContainerImage.fromAsset('../backend'),
      command: ['node', 'bin/worker.js'],
      environment: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: '3333',
        LOG_LEVEL: 'info',
        APP_KEY: appKey.valueAsString,
        DB_HOST: dbHost.valueAsString,
        DB_PORT: dbPort.valueAsString,
        DB_USER: dbUser.valueAsString,
        DB_PASSWORD: dbPassword.valueAsString,
        DB_DATABASE: dbDatabase.valueAsString,
        SQS_REPORTING_QUEUE_URL: sqsQueueUrl.valueAsString,
        S3_LOGOS_BUCKET: s3LogosBucket.valueAsString,
        S3_REPORTS_BUCKET: s3ReportsBucket.valueAsString,
        AWS_REGION: awsRegion.valueAsString,
        CDN_BASE_URL: cdnBaseUrl.valueAsString,
        SES_FROM_EMAIL: sesFromEmail.valueAsString,
        BEDROCK_MODEL_ID: bedrockModelId.valueAsString,
        BEDROCK_REGION: bedrockRegion.valueAsString,
        BEDROCK_TIMEOUT_MS: bedrockTimeoutMs.valueAsString,
        WHATSAPP_PHONE_NUMBER_ID: whatsappPhoneNumberId.valueAsString,
        WHATSAPP_ACCESS_TOKEN: whatsappAccessToken.valueAsString,
        WHATSAPP_API_VERSION: 'v18.0',
        WHATSAPP_TEMPLATE_NAME: 'report_delivery',
        WHATSAPP_TEMPLATE_LANGUAGE: 'pt_BR',
      },
      logging: ecs.LogDrivers.awsLogs({
        logGroup: workerLogGroup,
        streamPrefix: 'worker',
      }),
    });

    const workerSg = new ec2.SecurityGroup(this, 'WorkerSecurityGroup', {
      vpc,
      description: 'Security group for Boucheck worker Fargate tasks (no inbound)',
    });

    new ecs.FargateService(this, 'WorkerService', {
      cluster,
      taskDefinition: workerTaskDef,
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [workerSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    // --- Outputs ---

    new CfnOutput(this, 'ClusterName', { value: cluster.clusterName });
    new CfnOutput(this, 'ServiceName', { value: service.serviceName });
  }
}
