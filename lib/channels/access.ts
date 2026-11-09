// Who may connect channels and publish, in one place. Phase 1: the owner
// only (ADR 0004 slice 1). Opening it to creators changes this line.
export const canUsePublishing = (member: { isOwner: boolean }) => member.isOwner;
