import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';

const name = 'realtime-predictions';

const tags = {
  stack: name,
};

export class InfrastructureStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const bucketCode = new cdk.aws_s3.Bucket(this, 'bucket-code', {
      bucketName: `${name}-code`,
    });

    const bucketData = new cdk.aws_s3.Bucket(this, 'bucket-data', {
      bucketName: `${name}-data`,

    });

    // bucketData.addObjectCreatedNotification({
      
    // });

    const roleGlue = new cdk.aws_iam.Role(this, 'role-glue', {
      roleName: `${name}-glue`,
      assumedBy: new cdk.aws_iam.ServicePrincipal('glue.amazonaws.com'),
      managedPolicies: [
        { managedPolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSGlueServiceRole' },
      ],
      inlinePolicies: {
        'inline-policy-1': new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: [
                's3:*',
              ],
              resources: [
                `${bucketCode.bucketArn}*`,
                `${bucketData.bucketArn}*`,
              ],
            }),
          ],
        }),
      },
    });

    const jobEtl = new cdk.aws_glue.CfnJob(this, 'job-etl', {
      tags,
      name: `${name}-etl`,
      description: 'Prepare conversions data for model training.',
      role: roleGlue.roleArn,
      command: {
        name: 'glueetl',
        pythonVersion: '3',
        scriptLocation: `s3://${bucketCode.bucketName}/conversions_etl.py`,
      },
      glueVersion: '3.0',
      workerType: 'Standard',
      numberOfWorkers: 2,
    });

    const rolePipeline = new cdk.aws_iam.Role(this, 'role-pipeline', {
      roleName: `${name}-pipeline`,
      assumedBy: new cdk.aws_iam.ServicePrincipal('states.amazonaws.com'),
      inlinePolicies: {
        'inline-policy-1': new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: [
                'databrew:StartJobRun',
                'databrew:ListJobRuns',
              ],
              resources: [
                `*`,
              ],
            }),
          ],
        }),
      },
    });

    const roleSagemaker = new cdk.aws_iam.Role(this, 'role-sagemaker', {
      roleName: `${name}-sagemaker-pipeline`,
      assumedBy: new cdk.aws_iam.ServicePrincipal('sagemaker.amazonaws.com'),
      managedPolicies: [
        {
          managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonSageMakerFullAccess',
        },
      ],
      inlinePolicies: {
        'inline-policy-1': new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: [
                "s3:AbortMultipartUpload",
                "s3:DeleteObject",
                "s3:GetObject",
                "s3:GetObjectVersion",
                "s3:PutObject",
              ],
              resources: [
                `arn:aws:s3:::${bucketCode.bucketName}*`,
                `arn:aws:s3:::${bucketData.bucketName}*`,
                "arn:aws:s3:::sagemaker-*",
              ],
            }),
          ],
        }),
      },
    });

    new cdk.aws_sagemaker.CfnPipeline(this, 'sg-pipeline', {
      pipelineDefinition: {
        PipelineDefinitionBody: JSON.stringify(require('../pipeline/pipeline.json')),
      },
      pipelineName: name,
      roleArn: roleSagemaker.roleArn,
    });

    new cdk.aws_stepfunctions.CfnStateMachine(this, 'state', {
      stateMachineName: `${name}-pipeline`,
      roleArn: rolePipeline.roleArn,
      definition: {
        "Comment": "Load, filter, prepare, train and deploy.",
        "StartAt": "Brew",
        "States": {
          "Brew": {
            "Next": "Pass",
            "Parameters": {
              "Name": "test"
            },
            "Resource": "arn:aws:states:::databrew:startJobRun.sync",
            "Type": "Task"
          },
          "Pass": {
            "Comment": "A Pass state",
            "End": true,
            "Type": "Pass"
          }
        }
      },
    });
  }
}
