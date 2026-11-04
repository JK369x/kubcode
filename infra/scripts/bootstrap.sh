#!/usr/bin/env bash
# One-time, admin-run setup for the kubcode Pulumi stack (idempotent).
# Runs with the owner's local AWS profile, never in CI.
#
#   infra/scripts/bootstrap.sh state     S3 state bucket + KMS alias/kubcode-pulumi
#   infra/scripts/bootstrap.sh stack     pulumi stack `prod` with the awskms secrets provider
#   infra/scripts/bootstrap.sh cost-tag  activate the `project` cost allocation tag
#   infra/scripts/bootstrap.sh quota N   request Lambda concurrent executions = N
#                                        (the API only accepts N > 1000, the AWS
#                                        default; lower values need a console case)
#
# Only creates kubcode-* resources. Never runs `pulumi login`/`logout`: the
# backend is pinned in infra/Pulumi.yaml so the machine's default login stays.
set -euo pipefail

export AWS_PROFILE="${AWS_PROFILE:-default}"
export AWS_REGION=ap-southeast-1
ACCOUNT_ID=955758449820
STATE_BUCKET="kubcode-pulumi-state-${ACCOUNT_ID}"
STATE_KEY_ALIAS=alias/kubcode-pulumi
SECRETS_PROVIDER="awskms://${STATE_KEY_ALIAS}?region=${AWS_REGION}"
LAMBDA_CONCURRENCY_QUOTA=L-B99A9384
INFRA_DIR="$(cd "$(dirname "$0")/.." && pwd)"

check_account() {
  local actual
  actual=$(aws sts get-caller-identity --query Account --output text)
  if [ "$actual" != "$ACCOUNT_ID" ]; then
    echo "refusing: profile ${AWS_PROFILE} is account ${actual}, expected ${ACCOUNT_ID}" >&2
    exit 1
  fi
}

state() {
  if aws s3api head-bucket --bucket "$STATE_BUCKET" 2>/dev/null; then
    echo "state bucket exists: $STATE_BUCKET"
  else
    echo "creating state bucket: $STATE_BUCKET"
    aws s3api create-bucket --bucket "$STATE_BUCKET" \
      --create-bucket-configuration "LocationConstraint=${AWS_REGION}" >/dev/null
  fi
  aws s3api put-public-access-block --bucket "$STATE_BUCKET" --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
  aws s3api put-bucket-ownership-controls --bucket "$STATE_BUCKET" \
    --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'
  aws s3api put-bucket-versioning --bucket "$STATE_BUCKET" --versioning-configuration Status=Enabled
  # SSE-S3: stack secrets are already encrypted by the KMS secrets provider.
  aws s3api put-bucket-encryption --bucket "$STATE_BUCKET" --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}'
  aws s3api put-bucket-lifecycle-configuration --bucket "$STATE_BUCKET" --lifecycle-configuration '{
    "Rules":[{"ID":"tidy","Status":"Enabled","Filter":{},
      "NoncurrentVersionExpiration":{"NoncurrentDays":90},
      "AbortIncompleteMultipartUpload":{"DaysAfterInitiation":7}}]}'
  aws s3api put-bucket-policy --bucket "$STATE_BUCKET" --policy "{
    \"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"DenyInsecureTransport\",\"Effect\":\"Deny\",
    \"Principal\":\"*\",\"Action\":\"s3:*\",
    \"Resource\":[\"arn:aws:s3:::${STATE_BUCKET}\",\"arn:aws:s3:::${STATE_BUCKET}/*\"],
    \"Condition\":{\"Bool\":{\"aws:SecureTransport\":\"false\"}}}]}"
  aws s3api put-bucket-tagging --bucket "$STATE_BUCKET" --tagging 'TagSet=[{Key=project,Value=kubcode}]'

  if aws kms describe-key --key-id "$STATE_KEY_ALIAS" >/dev/null 2>&1; then
    echo "state key exists: $STATE_KEY_ALIAS"
  else
    echo "creating state key: $STATE_KEY_ALIAS"
    # Default key policy (account root -> IAM): the CI roles reach it through
    # their IAM policies, scoped to this key's ARN.
    local key_id
    key_id=$(aws kms create-key --description "kubcode-pulumi: Pulumi stack secrets provider" \
      --tags TagKey=project,TagValue=kubcode --query KeyMetadata.KeyId --output text)
    aws kms enable-key-rotation --key-id "$key_id"
    aws kms create-alias --alias-name "$STATE_KEY_ALIAS" --target-key-id "$key_id"
  fi
}

stack() {
  command -v pulumi >/dev/null || { echo "pulumi CLI not found" >&2; exit 1; }
  cd "$INFRA_DIR"
  [ -d node_modules ] || npm ci --ignore-scripts
  # The backend URL comes from Pulumi.yaml (no global login).
  if pulumi stack ls --json 2>/dev/null | grep -q '"name": *"prod"'; then
    echo "stack prod exists"
  else
    pulumi stack init prod --secrets-provider "$SECRETS_PROVIDER"
  fi
}

cost_tag() {
  # The key must have appeared in billing data first (up to 24h after the first
  # tagged resource). Re-run later if AWS says it is not found yet.
  if aws ce update-cost-allocation-tags-status \
      --cost-allocation-tags-status TagKey=project,Status=Active >/dev/null 2>&1; then
    aws ce list-cost-allocation-tags --tag-keys project --query 'CostAllocationTags[].[TagKey,Status]' --output text
  else
    echo "cost allocation tag 'project' is not visible to billing yet; re-run 'bootstrap.sh cost-tag' in ~24h" >&2
    exit 3
  fi
}

quota() {
  local desired="${1:-}" current pending
  [ -n "$desired" ] || { echo "usage: bootstrap.sh quota <desired concurrent executions>" >&2; exit 2; }
  current=$(aws service-quotas get-service-quota --service-code lambda \
    --quota-code "$LAMBDA_CONCURRENCY_QUOTA" --query Quota.Value --output text)
  echo "Lambda concurrent executions now: ${current}"
  pending=$(aws service-quotas list-requested-service-quota-change-history-by-quota --service-code lambda \
    --quota-code "$LAMBDA_CONCURRENCY_QUOTA" \
    --query "RequestedQuotas[?Status=='PENDING'||Status=='CASE_OPENED'].Id" --output text)
  if [ -n "$pending" ] && [ "$pending" != "None" ]; then
    echo "request already open: ${pending}"
    return
  fi
  aws service-quotas request-service-quota-increase --service-code lambda \
    --quota-code "$LAMBDA_CONCURRENCY_QUOTA" --desired-value "$desired" \
    --query 'RequestedQuota.[Id,Status,DesiredValue]' --output text
}

check_account
case "${1:-}" in
  state) state ;;
  stack) stack ;;
  cost-tag) cost_tag ;;
  quota) quota "${2:-}" ;;
  *) sed -n '2,14p' "$0"; exit 2 ;;
esac
