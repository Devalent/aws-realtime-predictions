import argparse
import json
import logging
import pathlib

import boto3
import pandas as pd

logger = logging.getLogger()
logger.setLevel(logging.INFO)
logger.addHandler(logging.StreamHandler())

feature_columns_names = ["country", "dos", "dtype", "dbrowser"]
class_column_name = "category"
y_column_name = "class"

base_dir = "/opt/ml/processing"
# base_dir = "temp"

if __name__ == "__main__":
    logger.debug("Starting preprocessing.")
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-columns", type=str, required=True)
    parser.add_argument("--input-classes", type=str, required=True)
    args = parser.parse_args()

    pathlib.Path(f"{base_dir}").mkdir(parents=True, exist_ok=True)

    input_columns = args.input_columns
    bucket_columns = input_columns.split("/")[2]
    prefix_columns = "/".join(input_columns.split("/")[3:])
    print(input_columns)

    input_classes = args.input_classes
    bucket_classes = input_classes.split("/")[2]
    prefix_classes = "/".join(input_classes.split("/")[3:])
    print(input_classes)

    s3 = boto3.resource("s3")
    s3client = boto3.client("s3")

    response_columns = s3client.list_objects_v2(
      Bucket=bucket_columns,
      Prefix=prefix_columns,
    )
    key_columns = response_columns['Contents'][0]['Key']

    logger.info("Downloading columns data from bucket: %s, key: %s", bucket_classes, key_columns)
    file_columns = f"{base_dir}/rows.csv"

    s3.Bucket(bucket_columns).download_file(key_columns, file_columns)

    response_classes = s3client.list_objects_v2(
      Bucket=bucket_classes,
      Prefix=prefix_classes,
    )
    key_classes = response_classes['Contents'][0]['Key']

    logger.info("Downloading classes data from bucket: %s, key: %s", bucket_classes, key_classes)
    file_classes = f"{base_dir}/classes.csv"

    s3.Bucket(bucket_classes).download_file(key_classes, file_classes)

    logger.debug("Processing columns.")

    pathlib.Path(f"{base_dir}/columns").mkdir(parents=True, exist_ok=True)
    
    df_columns = pd.read_csv(file_columns)

    with open(f"{base_dir}/columns/columns.json", 'w') as f:
      json.dump(list(df_columns.columns.values), f)

    logger.debug("Processing classes.")

    pathlib.Path(f"{base_dir}/classes").mkdir(parents=True, exist_ok=True)

    df_classes = pd.read_csv(file_classes)
    dic_offer = {}

    for index, row in df_classes.iterrows():
      dic_offer[row['offer']] = int(row['category'])

    with open(f"{base_dir}/classes/classes.json", 'w') as f:
      json.dump({
        "classes": dic_offer,
        "length": len(dic_offer),
        "length_str": str(len(dic_offer)),
      }, f)
