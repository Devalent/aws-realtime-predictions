#!/bin/bash

CAMPAIGN="97318a5c-bbab-4a5a-8a28-c6ab6fcbd79b"

echo "Starting the pipeline execution..."

ACCOUNT=$(aws sts get-caller-identity --query "Account" --output text)
EXECUTION=$(aws stepfunctions start-execution \
  --region us-west-2 \
  --state-machine-arn \
  arn:aws:states:us-west-2:$ACCOUNT:stateMachine:realtime-predictions-pipeline \
  --input '{ "campaign": "97318a5c-bbab-4a5a-8a28-c6ab6fcbd79b" }' \
  --no-cli-pager \
  --query "executionArn" \
  --output text)

echo "Pipeline URL: https://us-west-2.console.aws.amazon.com/states/home?region=us-west-2#/executions/details/$EXECUTION"
