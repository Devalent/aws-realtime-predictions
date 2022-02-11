import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';

const name = 'realtime-predictions';

export class InfrastructureStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const bucketDag = new cdk.aws_s3.Bucket(this, 'bucket-dag', {
      bucketName: `${name}-dag`,
    });

    const bucketData = new cdk.aws_s3.Bucket(this, 'bucket-data', {
      bucketName: `${name}-data`,
    });

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
                `${bucketDag.bucketArn}*`,
                `${bucketData.bucketArn}*`,
              ],
            }),
          ],
        }),
      },
    });
  }
}
