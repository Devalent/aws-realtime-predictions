import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';

const name = 'realtime-predictions';

export class InfrastructureStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const bucketData = new cdk.aws_s3.Bucket(this, 'bucket-data', {
      bucketName: `${name}-data`,
    });
  }
}
