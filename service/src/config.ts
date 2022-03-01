const maxmind_license_key = process.env['MAXMIND_LICENSE_KEY'];

export default {
  name: 'realtime-predictions',
  stage: 'production',
  region: 'us-west-2',
  bucket_model: 'realtime-predictions-model',
  table_model: 'realtime-predictions-production-model',
  sagemaker_endpoint: 'realtime-predictions-runtime',
  maxmind_license_key,
} as const;