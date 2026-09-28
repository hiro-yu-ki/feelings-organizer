import test from 'node:test';
import assert from 'node:assert/strict';
import { AppService } from '../src/service.js';
import { MockAIProvider } from '../src/infra/ai.js';
import { MemoryStore } from '../src/infra/store.js';

test('two participants can prepare privately, approve sharing, and complete a dialogue', async () => {
  const service = new AppService(await new MemoryStore().init(), new MockAIProvider());
  const participantA = await service.register({
    email: 'smoke-a@example.test',
    password: 'smoke-password-a',
    displayName: 'Participant A',
  });
  const participantB = await service.register({
    email: 'smoke-b@example.test',
    password: 'smoke-password-b',
    displayName: 'Participant B',
  });

  const session = await service.createSession(participantA.id, {
    title: 'Communication',
    purpose: '\u3059\u308c\u9055\u3044\u6574\u7406',
  });
  await service.joinSession(participantB.id, session.inviteCode);
  const privateText = '\u8fd4\u4fe1\u304c\u306a\u304f\u3066\u60b2\u3057\u304b\u3063\u305f\u3002\u5b89\u5fc3\u3067\u304d\u308b\u9023\u7d61\u65b9\u6cd5\u3092\u76f8\u8ac7\u3057\u305f\u3044\u3002';
  await service.prepare(participantA.id, session.id, { rawText: privateText });

  const ownerView = service.getSession(participantA.id, session.id);
  const otherView = service.getSession(participantB.id, session.id);
  assert.equal(ownerView.preparations.length, 1);
  assert.equal(otherView.preparations.length, 0);
  assert.equal(JSON.stringify(otherView).includes(privateText), false);

  const candidate = ownerView.shares.find((item) => item.approvalStatus === 'pending');
  assert.ok(candidate, 'mock analysis should create a share candidate');
  const approvedText = 'I felt sad and would like to discuss how we communicate.';
  await service.approveShare(participantA.id, session.id, candidate.id, {
    action: 'edit',
    editedContent: approvedText,
  });

  const sharedView = service.getSession(participantB.id, session.id);
  assert.equal(sharedView.shares.length, 1);
  assert.equal(sharedView.shares[0].content, approvedText);
  assert.equal(Object.hasOwn(sharedView.shares[0], 'generatedContent'), false);

  await service.addTurn(participantA.id, session.id, { text: 'I want to understand what happened.' });
  await service.addTurn(participantB.id, session.id, { text: 'I want to find a workable approach too.' });
  const summary = await service.complete(participantA.id, session.id);
  assert.ok(Array.isArray(summary.commonGround));
  assert.deepEqual(summary.agreements, []);
  assert.equal(service.getSession(participantB.id, session.id).session.status, 'completed');
});
