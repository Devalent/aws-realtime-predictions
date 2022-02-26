import os

import boto3
import json
import sagemaker
import sagemaker.session

from sagemaker.estimator import Estimator
from sagemaker.inputs import TrainingInput
from sagemaker.lambda_helper import Lambda
from sagemaker.processing import (
    ProcessingInput,
    ProcessingOutput,
    ScriptProcessor,
)
from sagemaker.sklearn.processing import SKLearnProcessor
from sagemaker.workflow.conditions import ConditionLessThanOrEqualTo
from sagemaker.workflow.condition_step import (
    ConditionStep,
)
from sagemaker.workflow.functions import (
    JsonGet,
)
from sagemaker.workflow.lambda_step import (
    LambdaStep,
)
from sagemaker.workflow.parameters import (
    ParameterInteger,
    ParameterString,
)
from sagemaker.workflow.pipeline import Pipeline
from sagemaker.workflow.properties import PropertyFile
from sagemaker.workflow.steps import (
    ProcessingStep,
    TrainingStep,
)

BASE_DIR = os.path.dirname(os.path.realpath(__file__))


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
    step_process = ProcessingStep(
        name="PreprocessData",
        processor=sklearn_processor,
        outputs=[
            ProcessingOutput(output_name='train',
                             source="/opt/ml/processing/train"),
            ProcessingOutput(output_name='validation',
                             source="/opt/ml/processing/validation"),
            ProcessingOutput(output_name='test',
                             source="/opt/ml/processing/test"),
            ProcessingOutput(output_name='columns',
                             source="/opt/ml/processing/columns"),
            ProcessingOutput(output_name='classes',
                             source="/opt/ml/processing/classes"),
        ],
        code=f's3://{code_bucket}/preprocess.py',
        job_arguments=["--input-data", input_data],
        property_files=[classes_map],
    )

    model_path = f"s3://{data_bucket}"
    image_uri = sagemaker.image_uris.retrieve(
        framework="xgboost",
        region=region,
        version="1.0-1",
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
        max_depth='6',
        num_round='100',
        eval_metric="mlogloss",
        min_child_weight='6',
        subsample='0.8',
        # max_depth='5',
        # eta='0.3',
        # gamma='0.0',
        # min_child_weight='1.0',
        # subsample='1.0',
        # csv_weights='0',
        # booster='gbtree',
        # max_delta_step='0',
        # colsample_bytree='1.0',
        # colsample_bylevel='1',
        # alpha='0.0',
        # sketch_eps='0.03',
        # scale_pos_weight='1.0',
        # updater='grow_colmaker,prune',
        # dsplit='row',
        # refresh_leaf='1',
        # grow_policy='depthwise',
        # max_leaves='0',
        # max_bin='256',
        # sample_type='uniform',
        # normalize_type='tree',
        # rate_drop='0.0',
        # one_drop='0',
        # skip_drop='0.0',
        # lambda_bias='0.0',
        # tweedie_variance_power='1.5',
        # base_score='0.5',
        # process_type='default',
        # tree_method='auto',
    )
    step_train = TrainingStep(
        name="TrainModel",
        estimator=xgb_train,
        inputs={
            "train": TrainingInput(
                s3_data=step_process.properties.ProcessingOutputConfig.Outputs[
                    "train"
                ].S3Output.S3Uri,
                content_type="text/csv",
            ),
            "validation": TrainingInput(
                s3_data=step_process.properties.ProcessingOutputConfig.Outputs[
                    "validation"
                ].S3Output.S3Uri,
                content_type="text/csv",
            ),
        },
    )

    # script_eval = ScriptProcessor(
    #     image_uri=image_uri,
    #     command=["python3"],
    #     instance_type=processing_instance_type,
    #     instance_count=1,
    #     base_job_name="evaluate",
    #     sagemaker_session=sagemaker_session,
    #     role=role,
    # )
    # evaluation_report = PropertyFile(
    #     name="EvaluationReport",
    #     output_name="evaluation",
    #     path="evaluation.json",
    # )
    # step_eval = ProcessingStep(
    #     name="EvaluateModel",
    #     processor=script_eval,
    #     inputs=[
    #         ProcessingInput(
    #             source=step_train.properties.ModelArtifacts.S3ModelArtifacts,
    #             destination="/opt/ml/processing/model",
    #         ),
    #         ProcessingInput(
    #             source=step_process.properties.ProcessingOutputConfig.Outputs[
    #                 "test"
    #             ].S3Output.S3Uri,
    #             destination="/opt/ml/processing/test",
    #         ),
    #     ],
    #     outputs=[
    #         ProcessingOutput(output_name='evaluation',
    #                          source="/opt/ml/processing/evaluation"),
    #     ],
    #     code=f's3://{code_bucket}/evaluate.py',
    #     property_files=[evaluation_report],
    # )

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
            "columns": step_process.properties.ProcessingOutputConfig.Outputs["columns"].S3Output.S3Uri,
            "classes": step_process.properties.ProcessingOutputConfig.Outputs["classes"].S3Output.S3Uri,
        },
    )

    # cond_lte = ConditionLessThanOrEqualTo(
    #     left=JsonGet(
    #         step_name=step_eval.name,
    #         property_file=evaluation_report,
    #         json_path="regression_metrics.mse.value"
    #     ),
    #     right=6.0,
    # )
    # step_cond = ConditionStep(
    #     name="CheckEvaluation",
    #     conditions=[cond_lte],
    #     if_steps=[step_lambda],
    #     else_steps=[],
    # )

    pipeline = Pipeline(
        name="realtime-predictions",
        parameters=[
            processing_instance_type,
            training_instance_type,
            input_data,
            campaign_id,
            model_id,
        ],
        # steps=[step_process, step_train, step_eval, step_cond],
        steps=[step_process, step_train, step_lambda],
        sagemaker_session=sagemaker_session,
    )
    return pipeline


if __name__ == '__main__':
    pipeline = get_pipeline(
        "us-west-2",
        "028812918682",
        "realtime-predictions-sagemaker-pipeline",
        "realtime-predictions-code",
        "realtime-predictions-data",
        "realtime-predictions-production-deployment",
    )

    filepath = os.path.join(os.path.dirname(
        os.path.realpath(__file__)), 'pipeline.json')

    with open(filepath, "w") as f:
        parsed = json.loads(pipeline.definition())
        f.write(json.dumps(parsed, indent=4, sort_keys=True))
