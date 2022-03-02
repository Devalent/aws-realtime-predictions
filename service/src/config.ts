const maxmind_license_key = process.env['MAXMIND_LICENSE_KEY'];

export default {
  name: 'realtime-predictions',
  stage: 'production',
  region: 'us-west-2',
  bucket_data: 'realtime-predictions-data',
  bucket_model: 'realtime-predictions-model',
  table_model: 'realtime-predictions-production-model',
  sagemaker_endpoint: 'realtime-predictions-runtime',
  state_machine: 'realtime-predictions-pipeline',
  glue_crawler: 'realtime-predictions',
  maxmind_license_key,
} as const;