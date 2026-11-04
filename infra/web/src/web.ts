// The kubcode.dev web host: one Lightsail instance with a static IP, and the
// apex A record that decides whether traffic goes to Vercel or to this box.
// Admin-applied only (see docs/adr/0001-host-web-on-lightsail.md). The account
// also holds client Lightsail instances: everything here is named kubcode-web*.
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { ACCOUNT_ID, PROJECT_TAG, REGION } from "../../src/constants";

export const WEB = {
  instance: "kubcode-web",
  staticIp: "kubcode-web-ip",
  keyPair: "kubcode-web-admin",
  bundle: "micro_3_0", // $7/mo: 1 GB RAM, 2 vCPU, 40 GB SSD, 2 TB, IPv4
  blueprint: "ubuntu_24_04",
  availabilityZone: `${REGION}a`,
  domain: "kubcode.dev",
  ttl: 60,
} as const;

// The apex A record as Vercel set it up (read from Route 53 on 2026-11-04).
// Flipping dnsTarget back to "vercel" restores exactly this.
export const VERCEL_APEX_IPS = ["216.198.79.1", "64.29.17.1"];

export type DnsTarget = "vercel" | "lightsail";

export function parseDnsTarget(value: string | undefined): DnsTarget {
  if (value === "vercel" || value === "lightsail") return value;
  throw new Error(`kubcode-web:dnsTarget must be "vercel" or "lightsail", got ${JSON.stringify(value)}`);
}

export type WebStackConfig = {
  /** The owner's SSH public key, installed for the admin login. */
  adminPublicKey: string;
  dnsTarget: DnsTarget;
};

export function createWebStack(cfg: WebStackConfig) {
  const provider = new aws.Provider("kubcode-web", {
    region: REGION,
    allowedAccountIds: [ACCOUNT_ID],
    defaultTags: { tags: { ...PROJECT_TAG } },
  });
  const opts = { provider };

  const keyPair = new aws.lightsail.KeyPair("admin-key", { name: WEB.keyPair, publicKey: cfg.adminPublicKey }, opts);

  // The OS is set up by host/provision.sh over SSH (re-runnable), not by
  // user data, which only runs once.
  const instance = new aws.lightsail.Instance(
    "web",
    {
      name: WEB.instance,
      availabilityZone: WEB.availabilityZone,
      blueprintId: WEB.blueprint,
      bundleId: WEB.bundle,
      keyPairName: keyPair.name,
      tags: { ...PROJECT_TAG },
    },
    { ...opts, protect: true },
  );

  // Losing the static IP would change the address the apex record points at.
  const staticIp = new aws.lightsail.StaticIp("web-ip", { name: WEB.staticIp }, { ...opts, protect: true });
  new aws.lightsail.StaticIpAttachment(
    "web-ip-attachment",
    { staticIpName: staticIp.name, instanceName: instance.name },
    opts,
  );

  // Replaces Lightsail's default ports. SSH stays open to all because GitHub
  // runner IPs are not fixed; the box allows keys only (provision.sh).
  new aws.lightsail.InstancePublicPorts(
    "web-ports",
    {
      instanceName: instance.name,
      portInfos: [22, 80, 443].map((port) => ({ protocol: "tcp", fromPort: port, toPort: port })),
    },
    opts,
  );

  const zone = aws.route53.getZoneOutput({ name: WEB.domain, privateZone: false }, { provider });
  new aws.route53.Record(
    "apex",
    {
      zoneId: zone.zoneId,
      name: WEB.domain,
      type: "A",
      ttl: WEB.ttl,
      records: cfg.dnsTarget === "lightsail" ? [staticIp.ipAddress] : VERCEL_APEX_IPS,
      // The record predates this stack (Vercel setup); take it over in place.
      allowOverwrite: true,
    },
    opts,
  );

  return {
    instanceName: instance.name,
    publicIp: staticIp.ipAddress,
    dnsTarget: pulumi.output(cfg.dnsTarget),
  };
}
