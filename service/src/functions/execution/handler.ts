import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import * as uuid from 'uuid';

import config from '@config';
import { formatJSONResponse } from '@libs/api-gateway';
import { middyfy } from '@libs/lambda';

const sfn = new SFNClient({ region: config.region });

const handler = async (event:APIGatewayProxyEventV2) => {
  console.log(JSON.stringify(event));

  const account = event.requestContext.accountId;
  const campaign = event.pathParameters?.['campaign'];

  if (!campaign) {
    return {
      statusCode: 404,
      body: `"Campaign ID not found"`,
    };
  }

  const model = uuid.v4();

  const { executionArn } = await sfn.send(new StartExecutionCommand({
    stateMachineArn: `arn:aws:states:${config.region}:${account}:stateMachine:${config.state_machine}`,
    input: JSON.stringify({ campaign }, undefined, '  '),
    name: model,
  }));

  return formatJSONResponse({
    step_machine_url: `https://${config.region}.console.aws.amazon.com/states/home?region=${config.region}#/executions/details/${executionArn}`,
    model_id: model,
  });
};

export const main = middyfy(handler);
