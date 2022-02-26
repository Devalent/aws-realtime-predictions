import { handlerPath } from '@libs/handler-resolver';
import type { AWS } from '@serverless/typescript';

export default {
  handler: `${handlerPath(__dirname)}/handler.main`,
  events: [
    {
      httpApi: {
        method: 'GET',
        path: '/predict/{campaign}',
      },
    },
  ],
} as AWS['functions'][''];
