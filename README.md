# Automated Predictions with Machine Learning on AWS

An end-to-end example of a serverless machine learning pipeline for multiclass classification on AWS with SageMaker Pipelines, Data Wrangler, Athena and XGBoost. See [this blog post](https://devalent.com/blog/automated-predictions-with-machine-learning-on-aws/) for details.

<p align="center">
  <img src="./img.png?raw=true" alt="" />
</p>

## Prerequisites

* Node.js
* Python
* AWS CLI

Optional:

* [MaxMind](https://www.maxmind.com/) license key (free)

## Installation

Before you proceed, set up `MAXMIND_LICENSE_KEY` environment variable with a valid license key. If not provided, IP address lookup will be disabled.

Install all required dependencies with command:

```
bash init.sh
```

## Deployment

The following command will deploy all resources and will launch an inference server:

```
bash deploy.sh
```

## Execution

To start the ML pipeline execution, run the command:

```
bash invoke.sh
```

It will return an AWS Console URL to the Step Functions pipeline that you can use to track the execution. Additionally, go to SageMaker and launch the Studio application to check the ML workflow progress.

## Project structure

### [data](./data)

Test data that will be deployed to S3.

### [infrastructure](./infrastructure)

AWS CDK project with infrastructure definition.

npm commands:

* `npm run bootstrap` - deploy the AWS CDK (required when deploying for the first time);
* `npm run deploy` - deploy the main infrastructure (no hourly costs);
* `npm run runtime` - deploy the runtime infrastructure (hourly costs incurred);
* `npm run stop` - delete the runtime infrastructure (the data will be retained).

### [pipeline](./pipeline)

SageMaker pipeline definitions and Python scripts.

### [service](./service)

Serverless.js project with Lambda API.

npm commands:

* `npm run deploy` - deploy the service.
