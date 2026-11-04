(function (root) {
  'use strict';
  const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const version = item => item?.version || null;
  const visible = doc => Object.values(doc.annotations || {}).filter(item => !item.deleted)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

  function attribution(item) {
    const origin = item.attribution;
    if (origin?.kind === 'ai') return 'AI标注';
    if (origin?.kind === 'human') return `制作：${origin.actor?.name || '员工'}`;
    // Legacy agent-created annotations have no explicit source field.
    const actor = item.updatedBy || item.createdBy;
    if (/^(codex|ai|assistant)$/i.test(actor?.id || '') || /^(codex|ai)$/i.test(actor?.name || '')) return 'AI标注';
    if (/^(codex|ai|assistant)$/i.test(item.createdBy?.id || '')) return `制作：${actor?.name || '员工'}`;
    return `制作：${item.createdBy?.name || '员工'}` + (item.updatedBy?.id && item.updatedBy.id !== item.createdBy?.id ? ` · 修改：${item.updatedBy.name}` : '');
  }

  // A project is one CAS-protected row. Each annotation has its own version,
  // so independent edits merge while edits to the same annotation need review.
  class Session {
    constructor({ row, actor, transport, persist = () => {}, changed = () => {}, restored = [] }) {
      this.row = copy(row);
      this.actor = actor;
      this.transport = transport;
      this.persist = persist;
      this.changed = changed;
      this.pending = new Map(restored);
      this.conflicts = new Set();
      this.saving = false;
      this.error = '';
    }
    get dirty() { return this.pending.size > 0; }
    view() {
      const doc = copy(this.row.payload);
      for (const [id, operation] of this.pending) doc.annotations[id] = copy(operation.value);
      return visible(doc);
    }
    notify() {
      try { this.persist([...this.pending]); this.cacheError = ''; }
      catch (_) { this.cacheError = '设备存储已满，未同步修改请勿关闭页面'; }
      this.changed(this);
    }
    edit(item, deleted = false) {
      const previous = this.pending.get(item.id);
      const value = { ...copy(item), version: crypto.randomUUID(), deleted,
        createdBy: item.createdBy || this.actor, createdAt: item.createdAt || new Date().toISOString(),
        updatedBy: this.actor, updatedAt: new Date().toISOString(),
        attribution: { kind: 'human', actor: copy(this.actor) } };
      this.pending.set(item.id, { base: previous ? previous.base : version(item), value });
      this.error = '';
      this.notify();
      return copy(value);
    }
    receive(row) {
      if (!row || row.ts < this.row.ts) return;
      this.row = copy(row);
      this.checkConflicts();
      if (!this.dirty) this.error = '';
      this.notify();
    }
    checkConflicts() {
      this.conflicts.clear();
      for (const [id, op] of this.pending) {
        const remote = this.row.payload.annotations[id];
        if (version(remote) === version(op.value)) this.pending.delete(id); // lost response, already committed
        else if (version(remote) !== op.base) this.conflicts.add(id);
      }
    }
    resolve(mode) {
      for (const id of this.conflicts) {
        const op = this.pending.get(id);
        this.pending.delete(id);
        if (mode === 'copy' && !op.value.deleted) {
          const value = { ...op.value, id: crypto.randomUUID(), version: crypto.randomUUID(),
            createdBy: this.actor, createdAt: new Date().toISOString(), copiedFrom: id };
          this.pending.set(value.id, { base: null, value });
        }
      }
      this.conflicts.clear();
      this.notify();
    }
    async flush() {
      if (this.saving || !this.dirty) return;
      this.saving = true;
      this.error = '';
      this.notify();
      try {
        for (let attempt = 0; attempt < 8 && this.dirty; attempt++) {
          // Always refresh before replaying an offline outbox.
          this.receive(await this.transport.read(this.row.user_id));
          const batch = new Map([...this.pending].filter(([id]) => !this.conflicts.has(id)));
          if (!batch.size) break;
          const payload = copy(this.row.payload);
          for (const [id, op] of batch) payload.annotations[id] = op.value;
          payload.meta.updatedAt = new Date().toISOString();
          payload.meta.updatedBy = this.actor;
          payload.meta.count = visible(payload).length;
          const result = await this.transport.cas(this.row, payload);
          if (!result) continue;
          for (const [id, sent] of batch) {
            const current = this.pending.get(id);
            if (!current) continue;
            if (version(current.value) === version(sent.value)) this.pending.delete(id);
            else current.base = version(sent.value); // keystrokes arrived during request
          }
          this.receive(result);
        }
      } catch (error) { this.error = error.message || '同步失败'; }
      finally { this.saving = false; this.notify(); }
    }
  }
  const api = { Session, visible, version, attribution };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DimensionModel = api;
})(globalThis);
