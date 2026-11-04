// Shape tests for the web host stack with Pulumi mocks: names, size, ports,
// the static IP, and the apex record switch between Vercel and Lightsail.
import test from "node:test";
import assert from "node:assert/strict";
import * as pulumi from "@pulumi/pulumi";
import { ACCOUNT_ID, REGION } from "../../src/constants";
import { VERCEL_APEX_IPS, WEB, parseDnsTarget } from "../src/web";

type Recorded = { type: string; name: string; inputs: any; provider?: string };
let resources: Recorded[] = [];
const STATIC_IP = "203.0.113.10";

pulumi.runtime.setMocks(
  {
    newResource(args) {
      resources.push({ type: args.type, name: args.name, inputs: args.inputs, provider: args.provider });
      const state = { ...args.inputs, arn: `arn:mock:${args.type}:${args.name}` };
      if (args.type === "aws:lightsail/staticIp:StaticIp") state.ipAddress = STATIC_IP;
      return { id: `${args.inputs.name ?? args.name}-id`, state };
    },
    call(args) {
      if (args.token === "aws:route53/getZone:getZone") return { zoneId: "ZTESTZONE", name: args.inputs.name };
      return {};
    },
  },
  "kubcode-web",
  "prod",
  true,
);

async function build(dnsTarget: "vercel" | "lightsail") {
  resources = [];
  const { createWebStack } = await import("../src/web");
  const out = createWebStack({ adminPublicKey: "ssh-ed25519 AAAATEST admin", dnsTarget });
  await new Promise((r) => setTimeout(r, 50));
  return out;
}

const resolve = <T>(o: pulumi.Output<T>) => new Promise<T>((r) => o.apply(r));
const byType = (t: string) => resources.filter((r) => r.type === t);
const one = (t: string) => {
  const found = byType(t);
  assert.equal(found.length, 1, `expected one ${t}`);
  return found[0];
};

test("instance is the $7 1 GB Ubuntu 24.04 bundle in Singapore", async () => {
  await build("vercel");
  const i = one("aws:lightsail/instance:Instance").inputs;
  assert.equal(i.name, "kubcode-web");
  assert.equal(i.bundleId, "micro_3_0");
  assert.equal(i.blueprintId, "ubuntu_24_04");
  assert.equal(i.availabilityZone, `${REGION}a`);
  assert.equal(i.keyPairName, WEB.keyPair);
  assert.equal(i.tags?.project, "kubcode");
});

test("every resource is kubcode-* and goes through the account-pinned provider", async () => {
  await build("vercel");
  const provider = one("pulumi:providers:aws");
  assert.deepEqual(JSON.parse(provider.inputs.allowedAccountIds), [ACCOUNT_ID]);
  assert.equal(provider.inputs.region, REGION);
  for (const r of resources.filter((r) => r.type !== "pulumi:providers:aws")) {
    assert.match(r.provider ?? "", /::kubcode-web::/, `${r.type} must use the pinned provider`);
    if (r.type.startsWith("aws:lightsail/") && r.inputs.name !== undefined)
      assert.match(r.inputs.name, /^kubcode-web/, `${r.type} name`);
  }
});

test("static IP is attached to the instance", async () => {
  await build("vercel");
  const ip = one("aws:lightsail/staticIp:StaticIp").inputs;
  const att = one("aws:lightsail/staticIpAttachment:StaticIpAttachment").inputs;
  assert.equal(ip.name, "kubcode-web-ip");
  assert.equal(att.staticIpName, "kubcode-web-ip");
  assert.equal(att.instanceName, "kubcode-web");
});

test("only SSH, HTTP and HTTPS are open", async () => {
  await build("vercel");
  const ports = one("aws:lightsail/instancePublicPorts:InstancePublicPorts").inputs;
  assert.equal(ports.instanceName, "kubcode-web");
  const opened = ports.portInfos.map((p: any) => `${p.protocol}/${p.fromPort}-${p.toPort}`).sort();
  assert.deepEqual(opened, ["tcp/22-22", "tcp/443-443", "tcp/80-80"]);
  // Stated, not left to AWS defaults: the stack says exactly what is open.
  for (const p of ports.portInfos) {
    assert.deepEqual(p.cidrs, ["0.0.0.0/0"]);
    assert.deepEqual(p.ipv6Cidrs, ["::/0"]);
  }
});

test("apex record stays on Vercel until the cutover, with TTL 60", async () => {
  await build("vercel");
  const rec = one("aws:route53/record:Record").inputs;
  assert.equal(rec.zoneId, "ZTESTZONE");
  assert.equal(rec.name, "kubcode.dev");
  assert.equal(rec.type, "A");
  assert.equal(rec.ttl, 60);
  assert.equal(rec.allowOverwrite, true);
  assert.deepEqual(rec.records, VERCEL_APEX_IPS);
});

test("cutover points the apex record at the static IP only", async () => {
  const out = await build("lightsail");
  const rec = one("aws:route53/record:Record").inputs;
  assert.deepEqual(rec.records, [STATIC_IP]);
  assert.equal(await resolve(out.publicIp), STATIC_IP);
});

test("dnsTarget must be spelled out", () => {
  assert.equal(parseDnsTarget("vercel"), "vercel");
  assert.equal(parseDnsTarget("lightsail"), "lightsail");
  assert.throws(() => parseDnsTarget(undefined), /dnsTarget/);
  assert.throws(() => parseDnsTarget("Lightsail"), /dnsTarget/);
});
