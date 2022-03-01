import { middyfy } from '@libs/lambda';
import { GlueClient, StartCrawlerCommand } from '@aws-sdk/client-glue';
import { SNSEvent } from 'aws-lambda';

import config from '@config';

const glue = new GlueClient({ region: config.region });

const handler = async (event:SNSEvent) => {
  console.log(JSON.stringify(event));

  console.log('Starting the crawler...');

  try {
    await glue.send(new StartCrawlerCommand({
      Name: config.glue_crawler,
    }));
  } catch (error) {
    if (error.errorType === 'CrawlerRunningException') {
      return;
    }

    throw error;
  }
};

export const main = middyfy(handler);
