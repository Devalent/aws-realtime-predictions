import sys
from awsglue.transforms import *
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext
from awsglue.context import GlueContext
from awsglue.job import Job

args = getResolvedOptions(sys.argv, ["JOB_NAME"])
sc = SparkContext()
glueContext = GlueContext(sc)
spark = glueContext.spark_session
job = Job(glueContext)
job.init(args["JOB_NAME"], args)

# Script generated for node Amazon S3
AmazonS3_node1644564670064 = glueContext.create_dynamic_frame.from_options(
    format_options={
        "quoteChar": '"',
        "withHeader": True,
        "separator": ",",
        "optimizePerformance": True,
    },
    connection_type="s3",
    format="csv",
    connection_options={
        "paths": ["s3://realtime-predictions-data/input/"],
        # "recurse": True,
    },
    transformation_ctx="AmazonS3_node1644564670064",
)

# Script generated for node Amazon S3
AmazonS3_node1644564851515 = glueContext.write_dynamic_frame.from_options(
    frame=AmazonS3_node1644564670064,
    connection_type="s3",
    format="csv",
    format_options={
        "writeHeader": False,
    },
    connection_options={
        "path": "s3://realtime-predictions-data/output/",
        "partitionKeys": [],
    },
    transformation_ctx="AmazonS3_node1644564851515",
)

job.commit()
