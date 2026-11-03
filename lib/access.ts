export type DownloadContext = {
  backendConfigured: boolean;
  session: boolean;
  member: string;
  rights: string;
  storageConfigured: boolean;
};
export function downloadEligibility(c: DownloadContext) {
  if (!c.backendConfigured)
    return { allowed: false, code: "BACKEND_NOT_CONFIGURED" };
  if (!c.session) return { allowed: false, code: "SESSION_REQUIRED" };
  if (c.member !== "approved")
    return { allowed: false, code: "MEMBER_NOT_APPROVED" };
  if (c.rights !== "cleared")
    return { allowed: false, code: "RIGHTS_NOT_CLEARED" };
  if (!c.storageConfigured)
    return { allowed: false, code: "STORAGE_NOT_CONFIGURED" };
  return { allowed: true, code: "ELIGIBLE" };
}
