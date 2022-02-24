import * as AWS from 'aws-sdk';
import * as URI from 'urijs';

import { middyfy } from '@libs/lambda';

type Input = {
  campaign:string;
  model:string;
  columns:string;
  classes:string;
};

const s3 = new AWS.S3({ region: 'us-west-2' });

const handler = async (event:Input) => {
  console.log(JSON.stringify(event));

  const modelUrl = URI.parse(event.model);
  const classeslUrl = URI.parse(event.classes);
  const columnsUrl = URI.parse(event.columns);

  const classes = await s3.getObject({
    Bucket: classeslUrl.hostname,
    Key: `${classeslUrl.path.substring(1)}/classes.json`,
  }).promise().then(x => JSON.parse(x.Body as string));
  const columns = await s3.getObject({
    Bucket: columnsUrl.hostname,
    Key: `${columnsUrl.path.substring(1)}/columns.json`,
  }).promise().then(x => JSON.parse(x.Body as string));

  console.log(classes);
  console.log(columns);

  await s3.copyObject({
    CopySource: `${modelUrl.hostname}${modelUrl.path}`,
    Bucket: 'realtime-predictions-model',
    Key: `${event.campaign}.tar.gz`,
  }).promise();
};

export const main = middyfy(handler);
