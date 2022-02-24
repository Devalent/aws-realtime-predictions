import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';

const name = 'realtime-predictions';

const tags:{ [x:string]:string; } = {
  stack: name,
};
const tagsList = Object.keys(tags).map((x) => ({ key: x, value: tags[x] }));

export class InfrastructureStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    
    const bucketCode = new cdk.aws_s3.Bucket(this, 'bucket-code', {
      bucketName: `${name}-code`,
    });

    const bucketData = new cdk.aws_s3.Bucket(this, 'bucket-data', {
      bucketName: `${name}-data`,
      lifecycleRules: [
        {
          id: 'expire',
          enabled: true,
          expiration: Duration.days(1),
        },
      ],
    });

    const bucketModel = new cdk.aws_s3.Bucket(this, 'bucket-model', {
      bucketName: `${name}-model`,
    });

    const bucketRaw = new cdk.aws_s3.Bucket(this, 'bucket-raw', {
      bucketName: `${name}-raw`,
    });

    const roleGlue = new cdk.aws_iam.Role(this, 'role-glue', {
      roleName: `${name}-glue`,
      assumedBy: new cdk.aws_iam.ServicePrincipal('glue.amazonaws.com'),
      managedPolicies: [
        { managedPolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSGlueServiceRole' },
      ],
      inlinePolicies: {
        'inline-policy-1': new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: [
                "s3:*",
              ],
              resources: [
                `${bucketRaw.bucketArn}*`,
                `${bucketData.bucketArn}*`,
              ],
            }),
          ],
        }),
      },
    });

    const database = new cdk.aws_glue.CfnDatabase(this, 'glue-database', {
      databaseInput: {
        name,
        description: `${name} database`,
      },
      catalogId: this.account,
    });

    const table = new cdk.aws_glue.CfnTable(this, 'glue-database-table', {
      catalogId: database.catalogId,
      databaseName: name,
      tableInput: {
        name: 'conversions',
        description: `${name} conversions`,
        parameters: {
          'compressionType': 'none',
          'classification': 'json',
        },
        storageDescriptor: {
          location: `s3://${bucketRaw.bucketName}/`,
          inputFormat: 'org.apache.hadoop.mapred.TextInputFormat',
          outputFormat: 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat',
          serdeInfo: {
            serializationLibrary: 'org.openx.data.jsonserde.JsonSerDe',
          },
        },
      },
    });
    table.addDependsOn(database);

    const crawler = new cdk.aws_glue.CfnCrawler(this, 'glue-crawler', {
      tags,
      name,
      databaseName: name,
      targets: {
        catalogTargets: [
          {
            databaseName: name,
            tables: [
              'conversions',
            ],
          }
        ],
      },
      role: roleGlue.roleArn,
      configuration: JSON.stringify({
        "Version": 1,
        "CrawlerOutput": {
          "Partitions": {
            "AddOrUpdateBehavior": "InheritFromTable",
          },
          "Tables": {
            "AddOrUpdateBehavior": "MergeNewColumns",
          },
        },
        "Grouping": {
          "TableGroupingPolicy": "CombineCompatibleSchemas",
        },
      }),
      schemaChangePolicy: {
        deleteBehavior: 'LOG',
        updateBehavior: 'UPDATE_IN_DATABASE',
      },
    });

    const athernaWorkgroup = new cdk.aws_athena.CfnWorkGroup(this, 'athena-workgroup', {
      name,
      tags: tagsList,
      workGroupConfiguration: {
        resultConfiguration: {
          outputLocation: `s3://${bucketData.bucketName}/queries/`,
        },
      },
    });

    const roleSagemaker = new cdk.aws_iam.Role(this, 'role-sagemaker', {
      roleName: `${name}-sagemaker-pipeline`,
      assumedBy: new cdk.aws_iam.ServicePrincipal('sagemaker.amazonaws.com'),
      managedPolicies: [
        {
          managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonSageMakerFullAccess',
        },
      ],
      inlinePolicies: {
        'inline-policy-1': new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: [
                "s3:*",
              ],
              resources: [
                `arn:aws:s3:::${bucketCode.bucketName}*`,
                `arn:aws:s3:::${bucketData.bucketName}*`,
                `arn:aws:s3:::${bucketModel.bucketName}*`,
              ],
            }),
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: [
                "lambda:InvokeFunction",
              ],
              resources: [
                `arn:aws:lambda:${this.region}:${this.account}:function:${name}*`,
              ],
            }),
          ],
        }),
      },
    });

    const sagemakerPipeline = new cdk.aws_sagemaker.CfnPipeline(this, 'sg-pipeline', {
      tags: tagsList,
      pipelineDefinition: {
        PipelineDefinitionBody: JSON.stringify(require('../pipeline/pipeline.json')),
      },
      pipelineName: name,
      roleArn: roleSagemaker.roleArn,
    });

    const sgModel = new cdk.aws_sagemaker.CfnModel(this, 'sg-model', {
      tags: tagsList,
      modelName: name,
      containers: [
        {
          image: `246618743249.dkr.ecr.us-west-2.amazonaws.com/sagemaker-xgboost:1.3-1-cpu-py3`,
          mode: 'MultiModel',
          modelDataUrl: `s3://${bucketData.bucketName}/models/`,
        },
      ],
      executionRoleArn: roleSagemaker.roleArn,
    });

    const sgEndpointConfig = new cdk.aws_sagemaker.CfnEndpointConfig(this, 'sg-endpoint-config', {
      tags: tagsList,
      endpointConfigName: name,
      productionVariants: [
        {
          modelName: sgModel.modelName!,
          initialVariantWeight: 1,
          initialInstanceCount: 1,
          variantName: 'default',
          instanceType: 'ml.t2.medium',
        },
      ],
    });
    sgEndpointConfig.addDependsOn(sgModel);

    const roleStates = new cdk.aws_iam.Role(this, 'role-state', {
      roleName: `${name}-state`,
      assumedBy: new cdk.aws_iam.ServicePrincipal('states.amazonaws.com'),
      inlinePolicies: {
        'inline-policy-1': new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: [
                'glue:*',
              ],
              resources: [
                `arn:aws:glue:${this.region}:${this.account}:crawler/${crawler.name}`,
                `arn:aws:glue:${this.region}:${this.account}:database/${name}`,
                `arn:aws:glue:${this.region}:${this.account}:table/${name}/*`,
              ],
            }),
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: [
                'glue:GetTable',
              ],
              resources: [
                `arn:aws:glue:${this.region}:${this.account}:catalog`,
              ],
            }),
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: [
                'athena:*',
              ],
              resources: [
                `arn:aws:athena:${this.region}:${this.account}:workgroup/${athernaWorkgroup.name}`,
              ],
            }),
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: [
                "s3:*",
              ],
              resources: [
                `arn:aws:s3:::${bucketData.bucketName}*`,
                `arn:aws:s3:::${bucketModel.bucketName}*`,
                `arn:aws:s3:::${bucketRaw.bucketName}*`,
              ],
            }),
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: [
                "sagemaker:*",
              ],
              resources: [
                `arn:aws:sagemaker:${this.region}:${this.account}:pipeline/${sagemakerPipeline.pipelineName}*`,
              ],
            }),
          ],
        }),
      },
    });

    const stateCrawler = new cdk.aws_stepfunctions.CfnStateMachine(this, 'state-crawler', {
      tags: tagsList,
      stateMachineName: `${name}-crawler`,
      roleArn: roleStates.roleArn,
      definition: {
        "Comment": "Crawl source data.",
        "StartAt": "Crawler",
        "States": {
          "Crawler": {
            "Type": "Task",
            "Parameters": {
              "Name": crawler.name,
            },
            "Resource": "arn:aws:states:::aws-sdk:glue:startCrawler",
            "End": true,
          },
        }
      },
    });

    const statePipeline = new cdk.aws_stepfunctions.CfnStateMachine(this, 'state-pipeline', {
      tags: tagsList,
      stateMachineName: `${name}-pipeline`,
      roleArn: roleStates.roleArn,
      definition: {
        "Comment": "Load, filter, prepare, train and deploy.",
        "StartAt": "Query",
        "States": {
          "Query": {
            "Parameters": {
              "QueryString.$": `States.Format('select country, city, long, lat, network, dos, dtype, dosversion, dbrowser, dbrowserversion, offer from AwsDataCatalog."${name}".conversions where campaign = \\'{}\\'', $.campaign)`,
              "WorkGroup": "realtime-predictions"
            },
            "Resource": "arn:aws:states:::athena:startQueryExecution.sync",
            "Type": "Task",
            "Next": "StartPipeline",
            "ResultPath": "$.query"
          },
          "StartPipeline": {
            "Type": "Task",
            "Parameters": {
              "PipelineName": sagemakerPipeline.pipelineName,
              "ClientRequestToken.$": "$$.Execution.Name",
              "PipelineExecutionDisplayName.$": "$$.Execution.Name",
              "PipelineParameters": [
                {
                  "Name": "InputDataUrl",
                  "Value.$": "$.query.QueryExecution.ResultConfiguration.OutputLocation"
                },
                {
                  "Name": "CampaignID",
                  "Value.$": "$.campaign"
                },
              ]
            },
            "Resource": "arn:aws:states:::aws-sdk:sagemaker:startPipelineExecution",
            "ResultPath": "$.pipeline",
            "Next": "Wait"
          },
          "Wait": {
            "Type": "Wait",
            "Seconds": 10,
            "Next": "Check"
          },
          "Check": {
            "Type": "Task",
            "Next": "Choice",
            "Parameters": {
              "PipelineExecutionArn.$": "$.pipeline.PipelineExecutionArn"
            },
            "Resource": "arn:aws:states:::aws-sdk:sagemaker:describePipelineExecution",
            "ResultPath": "$.result"
          },
          "Choice": {
            "Type": "Choice",
            "Choices": [
              {
                "Variable": "$.result.PipelineExecutionStatus",
                "StringEquals": "Succeeded",
                "Next": "Success"
              },
              {
                "Or": [
                  {
                    "Variable": "$.result.PipelineExecutionStatus",
                    "StringEquals": "Failed"
                  },
                  {
                    "Variable": "$.result.PipelineExecutionStatus",
                    "StringEquals": "Stopped"
                  }
                ],
                "Next": "Failure"
              }
            ],
            "Default": "Wait"
          },
          "Success": {
            "Type": "Pass",
            "End": true
          },
          "Failure": {
            "Type": "Fail"
          }
        }
      },
    });
  }
}
