// Pulumi entry point for the kubcode `prod` stack. See README.md.
import * as pulumi from "@pulumi/pulumi";
import { createStack } from "./src/stack";

const config = new pulumi.Config("kubcode");

// HOOK: Lambda roles that may encrypt/decrypt BYOK secrets with
// alias/kubcode-secrets. When a Lambda role is added to this stack (slice 2/5),
// append its ARN here, e.g. `publisherRole.arn`. Nothing else can use the key.
const secretsKeyUserArns: pulumi.Input<string>[] = [];

const outputs = createStack({
  // Stored as a secret: the owner's personal address stays out of git as plaintext.
  budgetEmail: config.getSecret("budgetEmail"),
  breakGlassAdminArns: config.requireObject<string[]>("breakGlassAdminArns"),
  secretsKeyUserArns,
  // openssl rand -hex 32; the Lambda, its role, log group and URL appear once set.
  packageSignerKey: config.getSecret("packageSignerKey"),
});

export const mediaBucket = outputs.mediaBucket;
export const secretsKeyArn = outputs.secretsKeyArn;
export const secretsKeyAlias = outputs.secretsKeyAlias;
export const deployRoleArn = outputs.deployRoleArn;
export const previewRoleArn = outputs.previewRoleArn;
export const boundaryPolicyArn = outputs.boundaryPolicyArn;
export const packageSignerUrl = outputs.packageSignerUrl;
