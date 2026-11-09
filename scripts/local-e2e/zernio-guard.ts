// Publish mode reuses the production Zernio profile and account; this is the
// only Zernio client it has. Reads pass; a post may be deleted only when the
// run was told to; nothing else (accounts, profiles, any write) goes out.

const ZERNIO = "https://zernio.com/api/v1";
const POST_ID = /^\/posts\/[A-Za-z0-9]{1,64}$/;

export function allowedZernioCall(method: string, path: string, opts: { cancelPosts: boolean }): boolean {
  const m = method.toUpperCase();
  if (m === "GET") return true;
  return m === "DELETE" && opts.cancelPosts && POST_ID.test(path);
}

export function guardedZernio(key: string, opts: { cancelPosts: boolean }) {
  return async (method: string, path: string): Promise<{ status: number; body: any }> => {
    if (!allowedZernioCall(method, path, opts)) throw new Error(`refused Zernio ${method} ${path.split("?")[0]}`);
    const res = await fetch(`${ZERNIO}${path}`, { method, headers: { authorization: `Bearer ${key}` }, redirect: "error" });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
}
