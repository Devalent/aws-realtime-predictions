import os

import boto3
import json
import sagemaker
import sagemaker.session
import sys

from sagemaker.estimator import Estimator
from sagemaker.inputs import TrainingInput
from sagemaker.lambda_helper import Lambda
from sagemaker.processing import (
    Processor,
    ProcessingInput,
    ProcessingOutput,
    ScriptProcessor,
)
from sagemaker.sklearn.processing import SKLearnProcessor
from sagemaker.workflow.conditions import ConditionLessThanOrEqualTo
from sagemaker.workflow.condition_step import (
    ConditionStep,
)
from sagemaker.workflow.execution_variables import ExecutionVariables
from sagemaker.workflow.functions import (
    Join,
    JsonGet,
)
from sagemaker.workflow.lambda_step import (
    LambdaStep,
)
from sagemaker.workflow.parameters import (
    ParameterString,
)
from sagemaker.workflow.pipeline import Pipeline
from sagemaker.workflow.properties import PropertyFile
from sagemaker.workflow.steps import (
    ProcessingStep,
    TrainingStep,
)

def get_pipeline(
    region,
    account,
    role,
    code_bucket,
    data_bucket,
    lambda_deployment,
):
    role = f"arn:aws:iam::{account}:role/{role}"

    boto_session = boto3.Session(region_name=region)

    sagemaker_client = boto_session.client("sagemaker")
    runtime_client = boto_session.client("sagemaker-runtime")
    sagemaker_session = sagemaker.session.Session(
        boto_session=boto_session,
        sagemaker_client=sagemaker_client,
        sagemaker_runtime_client=runtime_client,
        default_bucket=data_bucket,
    )

    processing_instance_type = ParameterString(
        name="ProcessingInstanceType", default_value="ml.m5.xlarge"
    )
    training_instance_type = ParameterString(
        name="TrainingInstanceType", default_value="ml.m5.xlarge"
    )
    input_data = ParameterString(
        name="InputDataUrl",
    )
    campaign_id = ParameterString(
        name="CampaignID",
    )
    model_id = ParameterString(
        name="ModelID",
    )

    datawrangler_image_uri = sagemaker.image_uris.retrieve(
        framework="data-wrangler",
        region=region,
        version="1.x",
        instance_type=processing_instance_type,
    )
    datawrangler_processor = Processor(
        role=role,
        image_uri=datawrangler_image_uri,
        instance_count=1,
        instance_type="ml.m5.4xlarge",
        sagemaker_session=sagemaker_session,
    )

    flow_filepath = os.path.join(os.path.dirname(os.path.realpath(__file__)), 'prepare.flow')

    with open(flow_filepath, 'r') as f:
        flow = json.load(f)

    for node in flow['nodes']:
        if node['type'] == 'SOURCE':
            wrangler_input_name = node['parameters']['dataset_definition']['name']
        if node['type'] == 'DESTINATION':
            if node['name'] == 'S3: train':
                wrangler_output_train = f"{node['node_id']}.{node['outputs'][0]['name']}"
            if node['name'] == 'S3: validation':
                wrangler_output_validation = f"{node['node_id']}.{node['outputs'][0]['name']}"
            if node['name'] == 'S3: test':
                wrangler_output_test = f"{node['node_id']}.{node['outputs'][0]['name']}"
            if node['name'] == 'S3: classes':
                wrangler_output_classes = f"{node['node_id']}.{node['outputs'][0]['name']}"
            if node['name'] == 'S3: columns':
                wrangler_output_columns = f"{node['node_id']}.{node['outputs'][0]['name']}"

    wrangler_output_config = {
        wrangler_output_train: {
            "content_type": "CSV"
        },
        wrangler_output_validation: {
            "content_type": "CSV"
        },
        wrangler_output_test: {
            "content_type": "CSV"
        },
        # wrangler_output_classes: {
        #     "content_type": "CSV"
        # },
        #  wrangler_output_columns: {
        #     "content_type": "CSV"
        # },
    }

    path_classes = Join(
        on="/",
        values=[
            "s3:/",
            data_bucket,
            "prepared",
            ExecutionVariables.PIPELINE_EXECUTION_ID,
            "classes",
        ],
    )
    path_columns = Join(
        on="/",
        values=[
            "s3:/",
            data_bucket,
            "prepared",
            ExecutionVariables.PIPELINE_EXECUTION_ID,
            "columns",
        ],
    )
    path_data_validation = Join(
        on="/",
        values=[
            "s3:/",
            data_bucket,
            "prepared",
            ExecutionVariables.PIPELINE_EXECUTION_ID,
            "validation",
        ],
    )
    path_data_test = Join(
        on="/",
        values=[
            "s3:/",
            data_bucket,
            "prepared",
            ExecutionVariables.PIPELINE_EXECUTION_ID,
            "test",
        ],
    )
    path_data_train = Join(
        on="/",
        values=[
            "s3:/",
            data_bucket,
            "prepared",
            ExecutionVariables.PIPELINE_EXECUTION_ID,
            "train",
        ],
    )

    step_prepare = ProcessingStep(
        name="PrepareData",
        processor=datawrangler_processor,
        inputs=[
            ProcessingInput(
                input_name="flow",
                source=f"s3://{code_bucket}/prepare.flow",
                destination="/opt/ml/processing/flow",
                s3_data_type="S3Prefix",
                s3_input_mode="File",
                s3_data_distribution_type="FullyReplicated"
            ),
            ProcessingInput(
                input_name=wrangler_input_name,
                source=input_data,
                destination="/opt/ml/processing/input",
                s3_data_type="S3Prefix",
                s3_input_mode="File",
                s3_data_distribution_type="FullyReplicated"
            ),
        ],
        outputs=[
            ProcessingOutput(output_name=wrangler_output_train,
                             source="/opt/ml/processing/train",
                             destination=path_data_train,
                             app_managed=True,
                            ),
            ProcessingOutput(output_name=wrangler_output_validation,
                             source="/opt/ml/processing/validation",
                             destination=path_data_validation,
                             app_managed=True,
                            ),
            ProcessingOutput(output_name=wrangler_output_test,
                             source="/opt/ml/processing/test",
                             destination=path_data_test,
                             app_managed=True,
                            ),
            ProcessingOutput(output_name=wrangler_output_classes,
                             source="/opt/ml/processing/classes",
                             destination=path_classes,
                             app_managed=True,
                            ),
            ProcessingOutput(output_name=wrangler_output_columns,
                             source="/opt/ml/processing/columns",
                             destination=path_columns,
                             app_managed=True,
                            ),
        ],
        job_arguments=[f"--output-config '{json.dumps(wrangler_output_config)}'"],
    )

    sklearn_processor = SKLearnProcessor(
        framework_version="0.23-1",
        instance_type=processing_instance_type,
        instance_count=1,
        base_job_name="preprocess",
        sagemaker_session=sagemaker_session,
        role=role,
    )
    classes_map = PropertyFile(
        name="ClassesMap",
        output_name="classes",
        path="classes.json",
    )

    path_preprocessed_columns = Join(
        on="/",
        values=[
            "s3:/",
            data_bucket,
            "preprocess",
            ExecutionVariables.PIPELINE_EXECUTION_ID,
            "columns",
        ],
    )
    path_preprocessed_classes = Join(
        on="/",
        values=[
            "s3:/",
            data_bucket,
            "preprocess",
            ExecutionVariables.PIPELINE_EXECUTION_ID,
            "classes",
        ],
    )

    step_process = ProcessingStep(
        name="PreprocessData",
        processor=sklearn_processor,
        outputs=[
            ProcessingOutput(output_name='columns',
                             source="/opt/ml/processing/columns",
                             destination=path_preprocessed_columns,
                             ),
            ProcessingOutput(output_name='classes',
                             source="/opt/ml/processing/classes",
                             destination=path_preprocessed_classes,
                             ),
        ],
        code=f's3://{code_bucket}/preprocess.py',
        job_arguments=[
            "--input-classes",
            path_classes,
            "--input-columns",
            path_columns,
        ],
        property_files=[classes_map],
        depends_on=[step_prepare]
    )
    
    model_path = f"s3://{data_bucket}/models"
    image_uri = sagemaker.image_uris.retrieve(
        framework="xgboost",
        region=region,
        version="1.3-1",
        py_version="py3",
        instance_type=training_instance_type,
    )
    xgb_train = Estimator(
        image_uri=image_uri,
        instance_type=training_instance_type,
        instance_count=1,
        output_path=model_path,
        base_job_name="train",
        sagemaker_session=sagemaker_session,
        role=role,
    )
    xgb_train.set_hyperparameters(
        num_class=JsonGet(
            step_name=step_process.name,
            property_file=classes_map,
            json_path="length_str"
        ),
        objective="multi:softprob",
        eta='0.2',
        gamma='4',
        max_depth='5',
        num_round='100',
        eval_metric="mlogloss",
        min_child_weight='6',
        subsample='0.8',
    )
    step_train = TrainingStep(
        name="TrainModel",
        estimator=xgb_train,
        inputs={
            "train": TrainingInput(
                s3_data=path_data_train,
                content_type="text/csv",
            ),
            "validation": TrainingInput(
                s3_data=path_data_validation,
                content_type="text/csv",
            ),
        },
    )

    script_eval = ScriptProcessor(
        image_uri=image_uri,
        command=["python3"],
        instance_type=processing_instance_type,
        instance_count=1,
        base_job_name="evaluate",
        sagemaker_session=sagemaker_session,
        role=role,
    )
    evaluation_report = PropertyFile(
        name="EvaluationReport",
        output_name="evaluation",
        path="evaluation.json",
    )
    path_evaluation = Join(
        on="/",
        values=[
            "s3:/",
            data_bucket,
            "evaluation",
            ExecutionVariables.PIPELINE_EXECUTION_ID,
        ],
    )
    step_eval = ProcessingStep(
        name="EvaluateModel",
        processor=script_eval,
        inputs=[
            ProcessingInput(
                source=step_train.properties.ModelArtifacts.S3ModelArtifacts,
                destination="/opt/ml/processing/model",
            ),
        ],
        outputs=[
            ProcessingOutput(output_name='evaluation',
                             source="/opt/ml/processing/evaluation",
                             destination=path_evaluation,
                             ),
        ],
        code=f's3://{code_bucket}/evaluate.py',
        job_arguments=[
            "--input-test",
            path_data_test,
        ],
        property_files=[evaluation_report],
    )

    lambda_func = Lambda(
        function_arn=f'arn:aws:lambda:{region}:{account}:function:{lambda_deployment}',
        session=sagemaker_session,
    )
    step_lambda = LambdaStep(
        name="DeployModel",
        lambda_func=lambda_func,
        inputs={
            "campaign": campaign_id,
            "model": model_id,
            "artifact": step_train.properties.ModelArtifacts.S3ModelArtifacts,
            "columns": path_preprocessed_columns,
            "classes": path_preprocessed_classes,
            "evaluation": path_evaluation,
        },
    )

    cond_lte = ConditionLessThanOrEqualTo(
        left=JsonGet(
            step_name=step_eval.name,
            property_file=evaluation_report,
            json_path="regression_metrics.hamming_loss.value"
        ),
        right=0.4,
    )
    step_cond = ConditionStep(
        name="CheckEvaluation",
        conditions=[cond_lte],
        if_steps=[step_lambda],
        else_steps=[],
    )

    pipeline = Pipeline(
        name="realtime-predictions",
        parameters=[
            processing_instance_type,
            training_instance_type,
            input_data,
            campaign_id,
            model_id,
        ],
        steps=[step_prepare, step_process, step_train, step_eval, step_cond],
        sagemaker_session=sagemaker_session,
    )
    return pipeline


if __name__ == '__main__':
    sys.stdout.write('Generating a pipeline definition...')
    sys.stdout.flush()

    pipeline = get_pipeline(
        "us-west-2",
        "028812918682",
        "realtime-predictions-sagemaker-pipeline",
        "realtime-predictions-code",
        "realtime-predictions-data",
        "realtime-predictions-production-deployment",
    )

    filepath = os.path.join(os.path.dirname(os.path.realpath(__file__)), 'pipeline.json')

    with open(filepath, "w") as f:
        parsed = json.loads(pipeline.definition())
        f.write(json.dumps(parsed, indent=4, sort_keys=True))
