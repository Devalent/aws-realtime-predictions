"""Evaluation script for measuring mean squared error."""
import argparse
import json
import logging
import pathlib
import pickle
import tarfile

import boto3
import numpy as np
import pandas as pd
import xgboost

from sklearn.metrics import hamming_loss

base_dir = "/opt/ml/processing"
# base_dir = "temp"

logger = logging.getLogger()
logger.setLevel(logging.INFO)
logger.addHandler(logging.StreamHandler())

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-test", type=str, required=True)
    args = parser.parse_args()

    input_test = args.input_test
    bucket_test = input_test.split("/")[2]
    prefix_test = "/".join(input_test.split("/")[3:])
    print(input_test)

    logger.debug("Downloading data.")

    s3 = boto3.resource("s3")
    s3client = boto3.client("s3")

    response_columns = s3client.list_objects_v2(
      Bucket=bucket_test,
      Prefix=prefix_test,
    )
    key_test = response_columns['Contents'][0]['Key']

    pathlib.Path(f"{base_dir}/test").mkdir(parents=True, exist_ok=True)

    logger.info("Downloading data from bucket: %s, key: %s", bucket_test, key_test)
    file_test = f"{base_dir}/test/test.csv"

    s3.Bucket(bucket_test).download_file(key_test, file_test)

    logger.debug("Reading test data.")
    df = pd.read_csv(file_test)
    y_test = df.iloc[:, 0].to_numpy()
    df.drop(df.columns[0], axis=1, inplace=True)
    X_test = xgboost.DMatrix(df.values)

    num_class = len(np.unique(y_test))

    logger.debug("Loading model.")
    model_path = f"{base_dir}/model/model.tar.gz"
    with tarfile.open(model_path) as tar:
        tar.extractall(path=".")

    # model = pickle.load(open("xgboost-model", "rb"))
    model = xgboost.Booster()
    model.load_model('xgboost-model')

    logger.info("Performing predictions against test data.")
    predictions = model.predict(X_test)

    num_samples = y_test.shape[0]
    predictions = predictions.reshape(num_samples, num_class)
    pred_label = np.argmax(predictions, axis=1)

    logger.debug("Calculating hamming loss.")

    hloss = hamming_loss(y_test, pred_label)

    report_dict = {
        "regression_metrics": {
            "hamming_loss": {
                "value": hloss,
            },
        },
    }

    output_dir = f"{base_dir}/evaluation"
    pathlib.Path(output_dir).mkdir(parents=True, exist_ok=True)

    logger.info("Writing out evaluation report with hamming loss (%f)", hloss)
    evaluation_path = f"{output_dir}/evaluation.json"
    with open(evaluation_path, "w") as f:
        f.write(json.dumps(report_dict))
