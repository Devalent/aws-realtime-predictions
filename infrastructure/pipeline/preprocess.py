import argparse
import json
import logging
import os
import pathlib
import tempfile

import boto3
import numpy as np
import pandas as pd
import urllib.parse

logger = logging.getLogger()
logger.setLevel(logging.INFO)
logger.addHandler(logging.StreamHandler())

feature_columns_names = ["country", "dos", "dtype", "dbrowser"]
class_column_name = "offer"
y_column_name = "class"

base_dir = "/opt/ml/processing"
#base_dir = "temp"

def codes_dictionary_one(unique_values):
  dic = {}
  count = 0
  for i in unique_values:
    if i in dic:
      count += 0
    else:
      if i == 0 or i == '0,0':
        dic[i] = 0  
      else:
        dic[i] = count
        count += 1
              
  return dic

def add_encoded_column(df, dictionary, column):
  res = df[column].replace(dictionary)
  df.drop([column], axis='columns', inplace=True)
  df[column] = res

if __name__ == "__main__":
    logger.debug("Starting preprocessing.")
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-data", type=str, required=True)
    args = parser.parse_args()

    pathlib.Path(f"{base_dir}").mkdir(parents=True, exist_ok=True)
    input_data = args.input_data
    bucket = input_data.split("/")[2]
    key = "/".join(input_data.split("/")[3:])

    logger.info("Downloading data from bucket: %s, key: %s", bucket, key)
    fn = f"{base_dir}/dataset.csv"
    s3 = boto3.resource("s3")
    s3.Bucket(bucket).download_file(key, fn)

    logger.debug("Reading downloaded data.")
    df = pd.read_csv(fn)
    os.unlink(fn)

    logger.debug("Transforming data.")

    X = df[feature_columns_names]
    y = df[[class_column_name]]

    for i in X.columns.values:
      X[i] = X[i].fillna('None')

    d = {' ': 'None'}
    X = X.replace(d)

    X = pd.get_dummies(X)
    X.rename(columns=lambda x: urllib.parse.quote(x), inplace=True)

    unique_values_offer = pd.unique(y[class_column_name]).tolist()
    dic_offer = codes_dictionary_one(unique_values_offer)
    add_encoded_column(y, dic_offer, class_column_name)

    X.insert(loc=0, column=y_column_name, value=y[class_column_name].values)

    logger.info("Splitting into train, validation, test datasets.")
    X.sample(frac=1).reset_index(drop=True)
    train, validation, test = np.split(X, [int(0.7 * len(X)), int(0.85 * len(X))])

    logger.info("Writing out datasets to %s.", base_dir)

    pathlib.Path(f"{base_dir}/train").mkdir(parents=True, exist_ok=True)
    pathlib.Path(f"{base_dir}/validation").mkdir(parents=True, exist_ok=True)
    pathlib.Path(f"{base_dir}/test").mkdir(parents=True, exist_ok=True)
    pathlib.Path(f"{base_dir}/columns").mkdir(parents=True, exist_ok=True)
    pathlib.Path(f"{base_dir}/classes").mkdir(parents=True, exist_ok=True)

    pd.DataFrame(train).to_csv(
      f"{base_dir}/train/train.csv", header=False, index=False
    )
    pd.DataFrame(validation).to_csv(
      f"{base_dir}/validation/validation.csv", header=False, index=False
    )
    pd.DataFrame(test).to_csv(
      f"{base_dir}/test/test.csv", header=False, index=False
    )

    with open(f"{base_dir}/columns/columns.json", 'w') as f:
      json.dump(list(X.columns.values), f)
      
    with open(f"{base_dir}/classes/classes.json", 'w') as f:
      json.dump({
        "classes": dic_offer,
        "length": len(dic_offer),
        "length_str": str(len(dic_offer)),
      }, f)
