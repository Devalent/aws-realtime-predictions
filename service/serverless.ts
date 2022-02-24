import type { AWS } from '@serverless/typescript';

import deployment from '@functions/deployment';

const serverlessConfiguration: AWS = {
  service: 'realtime-predictions',
  frameworkVersion: '3',
  plugins: ['serverless-esbuild'],
  provider: {
    name: 'aws',
    stage: 'production',
    region: 'us-west-2',
    runtime: 'nodejs14.x',
    memorySize: 128,
    timeout: 30,
    apiGateway: {
      minimumCompressionSize: 1024,
      shouldStartNameWithService: true,
    },
    environment: {
      AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
      NODE_OPTIONS: '--enable-source-maps --stack-trace-limit=1000',
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
              `arn:aws:s3:::realtime-predictions-*`,
            ],
          },
        ],
      },
    },    
  },
  functions: { deployment },
  package: { individually: true },
  custom: {
    esbuild: {
      bundle: true,
      minify: false,
      sourcemap: true,
      exclude: ['aws-sdk'],
      target: 'node14',
      define: { 'require.resolve': undefined },
      platform: 'node',
      concurrency: 10,
    },
  },
};

module.exports = serverlessConfiguration;
