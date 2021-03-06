import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SageMakerRuntimeClient, InvokeEndpointCommand } from '@aws-sdk/client-sagemaker-runtime';
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import * as querystring from 'querystring';
import UAParser from 'ua-parser-js';

import config from '@config';
import { ModelEndpoint, PredictionResult, PredictionSource } from '@domain/model';
import { formatJSONResponse } from '@libs/api-gateway';
import { middyfy } from '@libs/lambda';
import { getGeo2Ip } from '@libs/maxmind';

const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.region }));
const sagemaker = new SageMakerRuntimeClient({ region: config.region });

const categoricalFeatures:Array<keyof Pick<PredictionSource, 'country' | 'city' | 'isp' | 'network' | 'dos' | 'dbrowser' | 'dtype'>> = ['country', 'city', 'isp', 'network', 'dos', 'dbrowser', 'dtype'];
const numericFeatures:Array<keyof Pick<PredictionSource, 'lat' | 'long'>> = ['lat', 'long'];
const classField = 'class';
const categoryField = 'category';
const noneCategory = 'None';

const handler = async (event:APIGatewayProxyEventV2):Promise<APIGatewayProxyResultV2> => {
  const notices = [] as string[];

  const geo2ip = await getGeo2Ip();

  const campaignId = event.pathParameters?.['campaign'];

  const { Item:item } = await dynamodb.send(new GetCommand({
    TableName: config.table_model,
    Key: { campaign: campaignId } as ModelEndpoint,
  }));

  if (!item) {
    return {
      statusCode: 404,
      body: `"Model for campaign ${campaignId} not found"`,
    };
  }

  const endpoint = item as ModelEndpoint;

  const agent = new UAParser(event.queryStringParameters?.['ua'] || event.headers?.['user-agent']);

  const source:PredictionSource = {
    ip: event.queryStringParameters?.['ip'] || event.requestContext?.http?.sourceIp,
    dtype: agent.getDevice().type,
    dos: agent.getOS().name,
    dosversion: agent.getOS().version,
    dbrowser: agent.getBrowser().name,
    dbrowserversion: agent.getBrowser().version,
  };

  if (!geo2ip) {
    notices.push('MaxMind database was not enabled, IP address lookup is not available.');
  }

  if (geo2ip && source.ip) {
    try {
      const [asn, city] = await Promise.all([
        geo2ip.asn.asn(source.ip),
        geo2ip.city.city(source.ip),
      ]);

      if (asn) {
        source.isp = asn.autonomousSystemOrganization;
        source.network = asn.network;
      }

      if (city) {
        source.country = city.country?.isoCode;
        source.city = city.city?.names?.en;
        source.long = city.location?.longitude;
        source.lat = city.location?.latitude;
      }
    } catch (error) {
      notices.push(`IP lookup error: ${error.message}`);
    }
  }

  const providedEncodings = event.queryStringParameters?.['input']?.split(',');

  const encodings = (endpoint.columns || []).reduce((res, x, i) => {
    if (providedEncodings) {
      res.push(parseInt(providedEncodings[i]));
      return res;
    }

    const category = categoricalFeatures.find(y => x.startsWith(`${y}_`));
    const numeric = numericFeatures.find(y => y === x);

    switch (true) {
      case !!category:
        const categoryValue = source[category]?.toString().trim() || noneCategory;
        res.push(x === `${category}_${querystring.escape(categoryValue)}` ? 1 : 0);
        break;
      case !!numeric:
        res.push(source[numeric] || 0);
        break;
      case x === classField:
      case x === categoryField:
        break;
      default:
        res.push(0);
        break;
    }

    return res;
  }, []);

  try {
    const input = Buffer.from(event.queryStringParameters?.['input'] || encodings.join(','));

    const { Body:response } = await sagemaker.send(new InvokeEndpointCommand({
      EndpointName: config.sagemaker_endpoint,
      TargetModel: `${endpoint.model}.tar.gz`,
      Accept: 'application/json',
      ContentType: 'text/csv',
      Body: input,
    }));

    const offers = Object.keys(endpoint.classes).reduce((res, x) => {
      const index = parseInt(endpoint.classes[x]);

      if (!isNaN(index)) {
        res[index] = x;
      }

      return res;
    }, Array(Object.keys(endpoint.classes).length).fill(undefined) as string[]);

    const output = Buffer.from(response).toString('utf-8');
    const [probabilities] = JSON.parse(output) as number[][];

    const predictions = probabilities
      .reduce((res, probability, index) => {
        const offer = offers[index];

        if (offer && probability) {
          res.push({ index, offer, probability });
        }

        return res;
      }, [] as PredictionResult[])
      .sort((a, b) => b.probability - a.probability);

    const predicted = predictions[0] || null;

    return formatJSONResponse({
      notices: notices.length > 0 ? notices : undefined,
      input: input.toString('utf-8'),
      output,
      predicted,
      source,
      predictions,
      mappings: (endpoint.columns || [])
        .filter(x => x !== classField && x !== categoryField)
        .reduce((res, x, i) => {
          res[x] = encodings[i];
          return res;
        }, {} as { [x:string]:any; }),
      endpoint,
    });
  } catch (error) {
    console.error(error);

    return {
      statusCode: 500,
      body: `"Inference error. Make sure that the runtime resources have been deployed. Error: ${error.message}"`,
    };
  }
};

export const main = middyfy(handler);
