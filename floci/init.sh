#!/usr/bin/env sh

echo "Waiting for floci to be ready..."
until aws sqs list-queues > /dev/null 2>&1; do
  sleep 1
done
echo "floci is ready"

# Create the S3 buckets, SQS queues and SNS topics this service needs here, for example:
# aws sqs create-queue --queue-name fcp_sfd_bank_details_example
