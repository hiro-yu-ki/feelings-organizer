import { ForbiddenError, NotFoundError } from './schemas.js';

export function requireParticipant(db, sessionId, userId) {
  const session = db.sessions.find((x) => x.id === sessionId);
  if (!session) throw new NotFoundError('セッションが見つかりません');
  const participant = db.participants.find((x) => x.sessionId === sessionId && x.userId === userId);
  if (!participant) throw new ForbiddenError();
  return { session, participant };
}
export function ownPrivatePreparations(db, sessionId, userId) {
  requireParticipant(db, sessionId, userId);
  return db.privatePreparations.filter((x) => x.sessionId === sessionId && x.ownerUserId === userId);
}
export function visibleShares(db, sessionId, userId) {
  requireParticipant(db, sessionId, userId);
  return db.shareCandidates.filter((x) => x.sessionId === sessionId && (x.ownerUserId === userId || x.approvalStatus === 'shared')).map((x) => x.ownerUserId === userId ? x : ({ id:x.id, sessionId:x.sessionId, ownerUserId:x.ownerUserId, content:x.editedContent || x.generatedContent, approvalStatus:x.approvalStatus, sharedAt:x.sharedAt }));
}
export function approvedHistoricalReferences(db, sessionId) {
  return db.historyApprovals.filter((x) => x.sessionId === sessionId && x.approvalStatus === 'approved').map((x) => x.proposedReference);
}
export function redactSession(db, session, userId) {
  requireParticipant(db, session.id, userId);
  return { ...session, inviteCode: session.createdBy === userId ? session.inviteCode : undefined, participants: db.participants.filter((p) => p.sessionId === session.id).map((p) => ({ userId:p.userId, role:p.role, joinedAt:p.joinedAt, displayName:db.users.find((u) => u.id === p.userId)?.displayName })) };
}
