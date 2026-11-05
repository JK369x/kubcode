// Entry point for the kubcode-web stack. Run only from an admin machine:
//   cd infra/web && AWS_PROFILE=default pulumi preview / up --stack prod
import * as pulumi from "@pulumi/pulumi";
import { createWebStack, parseDnsTarget } from "./src/web";

const config = new pulumi.Config("kubcode-web");
const out = createWebStack({
  adminPublicKey: config.require("adminPublicKey"),
  dnsTarget: parseDnsTarget(config.get("dnsTarget")),
});

export const instanceName = out.instanceName;
export const publicIp = out.publicIp;
export const dnsTarget = out.dnsTarget;
