#!/usr/bin/env node

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { InfrastructureStack } from '../lib/infrastructure-stack';
import { RuntimeStack } from '../lib/runtime-stack';

const app = new cdk.App();
const infrastructure = new InfrastructureStack(app, 'realtime-predictions', {
  description: 'Static infrastructure with no hourly costs.',
});
new RuntimeStack(app, 'realtime-predictions-runtime', {
  description: 'Active compute resources with hourly costs.',
  endpointConfig: infrastructure.endpointConfig,
});
