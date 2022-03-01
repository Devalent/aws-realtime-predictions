import { S3Client, GetObjectCommand, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

import { Readable } from 'stream';
import * as URI from 'urijs';

import config from '@config';
import { ModelEndpoint } from '@domain/model';
import { PipelineEvent } from '@domain/pipeline';
import { middyfy } from '@libs/lambda';

const classField = 'class';
const categoryField = 'category';

const s3 = new S3Client({ region: config.region });
const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.region }));

const getJson = async (bucket:string, key:string):Promise<any> => {
  return await s3.send(new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  })).then(async (x) => {
    const stream = x.Body as Readable;

    const data = await new Promise<Buffer>((resolve, reject) => {
      const chunks:Buffer[] = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.once('end', () => resolve(Buffer.concat(chunks)));
      stream.once('error', reject);
    });

    return JSON.parse(data.toString('utf-8'));
  });
};

const handler = async (event:PipelineEvent) => {
  console.log(JSON.stringify(event));

  const artifactUrl = URI.parse(event.artifact);
  const classeslUrl = URI.parse(event.classes);
  const columnsUrl = URI.parse(event.columns);
  const evaluationUrl = URI.parse(event.evaluation);

  const [classes, columns, evaluation, res] = await Promise.all([
    getJson(classeslUrl.hostname, `${classeslUrl.path.substring(1)}/classes.json`),
    getJson(columnsUrl.hostname, `${columnsUrl.path.substring(1)}/columns.json`),
    getJson(evaluationUrl.hostname, `${evaluationUrl.path.substring(1)}/evaluation.json`),
    s3.send(new CopyObjectCommand({
      CopySource: `${artifactUrl.hostname}${artifactUrl.path}`,
      Bucket: config.bucket_model,
      Key: `${event.model}.tar.gz`,
    })),
  ]);

  const entry:ModelEndpoint = {
    campaign: event.campaign,
    model: event.model,
    modified: Math.round(Date.now() / 1000),
    columns: columns.filter(x => x && x !== classField && x !== categoryField),
    classes: Object.keys(classes.classes).reduce((res, x) => {
      res[x] = classes.classes[x].toString();
      return res;
    }, {} as ModelEndpoint['classes']),
    evaluation: {
      hamming_loss: evaluation['regression_metrics']['hamming_loss']['value'],
    },
  };

  console.log(entry);

  const { Attributes:oldItem } = await dynamodb.send(new PutCommand({
    TableName: config.table_model,
    Item: entry,
    ReturnValues: 'ALL_OLD',
  }));

  if (oldItem) {
    const oldEntry = oldItem as ModelEndpoint;

    try {
      if (oldEntry.model !== entry.model) {
        await s3.send(new DeleteObjectCommand({
          Bucket: config.bucket_model,
          Key: `${oldEntry.model}.tar.gz`,
        }));
      }
    } catch (error) {
      console.error(error);
    }
  }
};

export const main = middyfy(handler);
