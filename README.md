# Automated Predictions with Machine Learning on AWS

See [this blog post](https://devalent.com/blog/automated-predictions-with-machine-learning-on-aws/) for details.

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

## Project structure

### `./data`

Test data that will be deployed to S3.

### `./infrastructure`

AWS CDK project with infrastructure definition.

npm commands:

* `npm run bootstrap` - deploy the AWS CDK;
* `npm run deploy` - deploy the main infrastructure;
* `npm run runtime` - deploy the runtime infrastructure (hourly costs incurred);
* `npm run stop` - delete the runtime infrastructure.

### `./pipeline`

SageMaker pipeline definitions and Python scripts.

### `./service`

Serverless.js project with Lambda API.

npm commands:

* `npm run deploy` - deploy the service.
