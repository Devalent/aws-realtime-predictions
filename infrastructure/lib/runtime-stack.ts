import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as emoji from 'node-emoji';
import { terminal } from 'terminal-kit';

const name = 'realtime-predictions-runtime';

const tags:{ [x:string]:string; } = {
  stack: name,
};
const tagsList = Object.keys(tags).map((x) => ({ key: x, value: tags[x] }));

export class RuntimeStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps & { endpointConfig:cdk.aws_sagemaker.CfnEndpointConfig }) {
    super(scope, id, props);
    
    const enabled = this.node.tryGetContext('RUNTIME');

    if (enabled === undefined) {
      return;
    }

    if (Boolean(enabled)) {
      terminal
        .red('=========================================================================================================================================\n')
        .red(`${emoji.get('rocket')} ${emoji.get('rocket')} ${emoji.get('rocket')}\n`)
        .red(`Deploying the computational resources that will get billed even when not used.\n`)
        .red(`In order to stop these resources, run `)
        .bold.brightBlue('npm run stop')
        .red('\nNo data will be lost as the result, just redeploy again when needed.\n')
        .red('=========================================================================================================================================\n');

      new cdk.aws_sagemaker.CfnEndpoint(this, 'endpoint', {
        tags: tagsList,
        endpointName: name,
        endpointConfigName: props!.endpointConfig.endpointConfigName!,
      });
    } else {
      terminal
        .green('=========================================================================================================================================\n')
        .green(`${emoji.get('white_check_mark')} ${emoji.get('white_check_mark')} ${emoji.get('white_check_mark')}\n`)
        .green('Stopping the computational resources.\nIn order to deploy them again, run ')
        .bold.brightYellow('npm run runtime\n')
        .green('=========================================================================================================================================\n');
    }
  }
}
