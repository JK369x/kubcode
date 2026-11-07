import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { sessionOf } from "@/lib/keys/connect-routes";
import { reviewerChannels } from "@/lib/keys/store";
import { validReviewCode, REVIEW_COOKIE, expiresAt } from "@/lib/keys/reviewer";
import { readAccountsConfig } from "@/lib/accounts/config";
import { keysEnabled } from "@/lib/keys/access";
import { ReviewChannels } from "./review-channels";

export const metadata = { title: "YouTube review · kubcode", robots: { index: false, follow: false } };
async function redeem(form: FormData) {
  "use server";
  const code = form.get("code");
  if (typeof code !== "string" || !validReviewCode(code)) redirect("/review/youtube?invalid=1");
  (await cookies()).set(REVIEW_COOKIE, code, { httpOnly: true, secure: true, sameSite: "lax", path: "/", expires: new Date(expiresAt) });
  redirect("/review/youtube");
}
export default async function ReviewPage({searchParams}: {searchParams: Promise<Record<string,string|undefined>>}) {
  const jar = await cookies();
  const params = await searchParams;
  const invited = validReviewCode(jar.get(REVIEW_COOKIE)?.value);
  const db = readAccountsConfig(process.env);
  const session = invited && keysEnabled(process.env) && db.mode === "on" ? await sessionOf(new Request("https://kubcode.dev/review/youtube", {headers: await headers()}),process.env) : null;
  const channels = session && db.mode === "on" ? await reviewerChannels(db.databaseUrl, session) : null;
  return <main id="main" className="reading"><h1>YouTube channel review</h1>
    {!invited ? <form action={redeem}><p>Enter the access code provided with the review request.</p><label>Reviewer access code <input type="password" autoComplete="off" name="code" required /></label> <button type="submit">Continue</button>{params.invalid && <p role="alert">Invalid or expired code.</p>}</form>
    : !channels ? <p><a href="/account">Sign in to kubcode</a> with your own account, then return to this page to connect your YouTube channel.</p>
    : <><p>Connect your own channel, choose an MP4 and upload it privately. Verify the result in YouTube Studio.</p>{params.notice && <p role="status">{params.notice === "connected" ? "Channel connected." : "Connection did not complete. Try connecting again."}</p>}<ReviewChannels channels={channels} /></>}
  </main>;
}
