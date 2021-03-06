import type { AWS } from '@serverless/typescript';
import * as emoji from 'node-emoji';
import { terminal } from 'terminal-kit';

import config from '@config';
import { deployment, execution, prediction, s3 } from '@functions/index';

if (!config.maxmind_license_key) {
  terminal
    .red('=========================================================================================================================================\n')
    .red(`${emoji.get('rotating_light')} ${emoji.get('rotating_light')} ${emoji.get('rotating_light')}\n`)
    .red(`MAXMIND_LICENSE_KEY environment variable was not set. IP address lookup will not be available.\n`)
    .red('=========================================================================================================================================\n');
}

const serverlessConfiguration:AWS = {
  service: config.name,
  frameworkVersion: '3',
  plugins: ['serverless-esbuild'],
  provider: {
    name: 'aws',
    stage: config.stage,
    region: config.region,
    runtime: 'nodejs14.x',
    memorySize: 512,
    timeout: 29,
    apiGateway: {
      minimumCompressionSize: 1024,
      shouldStartNameWithService: true,
    },
    httpApi: {
      name: `${config.name}-${config.stage}`,
    },
    environment: {
      AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
      NODE_OPTIONS: '--enable-source-maps --stack-trace-limit=1000',
      MAXMIND_LICENSE_KEY: config.maxmind_license_key,
    },
    iam: {
      role: {
        statements: [
          {
            Effect: 'Allow',
            Action: [
              's3:*',
            ],
            Resource: [
              `arn:aws:s3:::${config.bucket_data}*`,
              `arn:aws:s3:::${config.bucket_model}*`,
            ],
          },
          {
            Effect: 'Allow',
            Action: [
              'dynamodb:*',
            ],
            Resource: [
              `arn:aws:dynamodb:${config.region}:*:table/${config.table_model}*`,
            ],
          },
          {
            Effect: 'Allow',
            Action: [
              'sagemaker:InvokeEndpointAsync',
              'sagemaker:InvokeEndpoint',
            ],
            Resource: [
              `arn:aws:sagemaker:${config.region}:*:endpoint/${config.sagemaker_endpoint}*`,
            ],
          },
          {
            Effect: 'Allow',
            Action: [
              'glue:StartCrawler',
            ],
            Resource: [
              `arn:aws:glue:${config.region}:*:crawler/${config.glue_crawler}`,
            ],
          },
          {
            Effect: 'Allow',
            Action: [
              'states:StartExecution',
            ],
            Resource: [
              `arn:aws:states:${config.region}:*:stateMachine:${config.state_machine}*`,
            ],
          },
        ],
      },
    },    
  },
  functions: { deployment, execution, prediction, s3 },
  package: { individually: true },
  custom: {
    esbuild: {
      bundle: true,
      minify: false,
      sourcemap: true,
      exclude: [],
      target: 'node14',
      define: { 'require.resolve': undefined },
      platform: 'node',
      concurrency: 10,
    },
  },
  resources: {
    Resources: {
      'TableModel': {
        Type: 'AWS::DynamoDB::Table',
        DeletionPolicy: 'Retain',
        Properties: {
          TableName: config.table_model,
          Tags: [
            {
              Key: 'stack',
              Value: config.name,
            },
          ],
          BillingMode: 'PAY_PER_REQUEST',
          AttributeDefinitions: [
            {
              AttributeName: 'campaign',
              AttributeType: 'S',
            },
          ],
          KeySchema: [
            {
              AttributeName: 'campaign',
              KeyType: 'HASH',
            },
          ],
        },
      },
    },
  },
};

module.exports = serverlessConfiguration;
