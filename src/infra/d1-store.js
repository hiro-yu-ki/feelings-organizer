const collections = ['users','sessions','participants','privatePreparations','shareCandidates','turns','interventions','conversationStates','fairnessStates','summaries','historyApprovals','aiRequests'];
const emptyDatabase = () => Object.fromEntries(collections.map((key) => [key, []]));

// AppService takes synchronous snapshots, so each request loads one version.
// Compare-and-swap retries keep concurrent requests from losing updates.
export class D1Store {
  constructor(db, data, version) {
    this.db = db;
    this.data = { ...emptyDatabase(), ...JSON.parse(data) };
    this.version = version;
  }

  static async load(db) {
    const row = await db.prepare('SELECT data, version FROM app_state WHERE id = 1').first();
    if (!row) throw new Error('D1 migration is missing');
    return new D1Store(db, row.data, row.version);
  }

  snapshot() { return structuredClone(this.data); }

  async mutate(fn) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const draft = structuredClone(this.data);
      const result = await fn(draft);
      const written = await this.db.prepare(
        'UPDATE app_state SET data = ?, version = version + 1 WHERE id = 1 AND version = ?'
      ).bind(JSON.stringify(draft), this.version).run();
      if (written.meta.changes === 1) {
        this.data = draft;
        this.version++;
        return result;
      }
      const latest = await D1Store.load(this.db);
      this.data = latest.data;
      this.version = latest.version;
    }
    throw Object.assign(new Error('更新が集中しています。もう一度お試しください'), { status: 503 });
  }
}
