const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

class FakeClassList {
    constructor() {
        this.values = new Set();
    }

    add(name) {
        this.values.add(name);
    }

    remove(name) {
        this.values.delete(name);
    }

    contains(name) {
        return this.values.has(name);
    }
}

class FakeElement {
    constructor(id) {
        this.id = id;
        this.listeners = {};
        this.classList = new FakeClassList();
        this.dataset = {};
        this.disabled = false;
        this.contentEditable = true;
        this.className = '';
        this.children = [];
        this.insertedHtml = '';
        this._textContent = '';
        this._innerHTML = '';
    }

    addEventListener(type, handler) {
        this.listeners[type] = handler;
    }

    focus() {}

    querySelector(selector) {
        if (selector === '.status-text') return this.statusText;
        return null;
    }

    querySelectorAll() {
        return [];
    }

    insertAdjacentHTML(position, html) {
        this.insertedHtml += html;
    }

    remove() {}

    set textContent(value) {
        this._textContent = String(value);
    }

    get textContent() {
        return this._textContent;
    }

    set innerHTML(value) {
        this._innerHTML = String(value);
    }

    get innerHTML() {
        if (this._innerHTML) return this._innerHTML;
        return this._textContent
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;');
    }
}

function createHarness(options = {}) {
    const elements = new Map();

    function element(id) {
        if (!elements.has(id)) {
            elements.set(id, new FakeElement(id));
        }
        return elements.get(id);
    }

    const statusIndicator = element('statusIndicator');
    statusIndicator.statusText = new FakeElement('statusText');

    [
        'logForm',
        'cancelBtn',
        'cancelDelete',
        'confirmDelete',
        'deleteModal',
        'logContent',
        'submitBtn',
        'timeline',
        'pagination',
        'prevPageBtn',
        'nextPageBtn',
        'pageTabs',
        'emptyState',
        'errorState'
    ].forEach(element);

    const storage = new Map();
    const documentListeners = {};
    const windowListeners = {};

    const sandbox = {
        console: {
            log() {},
            warn() {},
            error() {}
        },
        Date,
        Promise,
        Error,
        JSON,
        setTimeout() {
            return 1;
        },
        clearTimeout() {},
        navigator: { onLine: true },
        localStorage: {
            getItem(key) {
                return storage.has(key) ? storage.get(key) : null;
            },
            setItem(key, value) {
                if (options.quotaError) throw new Error("QuotaExceededError");
                storage.set(key, String(value));
            }
        },
        Event: function Event(name) {
            this.type = name;
        },
        document: {
            getElementById: element,
            createElement: () => new FakeElement('created'),
            addEventListener(type, handler) {
                documentListeners[type] = handler;
            },
            execCommand() {
                return true;
            }
        },
        window: null
    };

    sandbox.window = sandbox;
    if (options.bootstrap) sandbox.LOG_BOOTSTRAP = options.bootstrap;
    sandbox.addEventListener = (type, handler) => {
        windowListeners[type] = handler;
    };
    sandbox.dispatchEvent = (event) => {
        const handler = windowListeners[event.type];
        if (handler) handler(event);
    };

    const scriptPath = path.join(__dirname, 'script.js');
    const source = fs.readFileSync(scriptPath, 'utf8') + `
globalThis.__logTest = {
    LogManager,
    PAGE_SIZE,
    PREVIEW_CHARS,
    network,
    status,
    setClient(client) { dbClient = client; },
    getClient() { return dbClient; }
};`;

    vm.runInNewContext(source, sandbox, { filename: scriptPath });

    return {
        ...sandbox.__logTest,
        element,
        storage,
        documentListeners,
        windowListeners
    };
}

function createMockClient(initialLogs = []) {
    const calls = {
        selects: [],
        orders: [],
        inserts: [],
        updates: [],
        deletes: [],
        subscriptions: []
    };

    let realtimeHandler = null;

    const client = {
        calls,
        from(table) {
            assert.ok(['logs', 'logs_list'].includes(table));
            return {
                select(columns, options) {
                    const query = {
                        table,
                        columns,
                        options: options || {},
                        filters: [],
                        order: null,
                        limit: null,
                        range: null
                    };
                    const runQuery = () => {
                        calls.selects.push({
                            table: query.table,
                            columns: query.columns,
                            options: query.options,
                            filters: [...query.filters],
                            order: query.order,
                            limit: query.limit,
                            range: query.range
                        });

                        let rows = [...initialLogs];
                        query.filters.forEach(filter => {
                            if (filter.op === 'lt') {
                                rows = rows.filter(row => row[filter.column] < filter.value);
                            } else if (filter.op === 'eq') {
                                rows = rows.filter(row => row[filter.column] === filter.value);
                            }
                        });
                        if (query.order) {
                            const direction = query.order.options && query.order.options.ascending ? 1 : -1;
                            rows.sort((a, b) => {
                                if (a[query.order.column] === b[query.order.column]) return 0;
                                return a[query.order.column] > b[query.order.column] ? direction : -direction;
                            });
                        }

                        const count = rows.length;
                        if (query.range) rows = rows.slice(query.range.from, query.range.to + 1);
                        else if (query.limit != null) rows = rows.slice(0, query.limit);

                        if (query.table === 'logs_list') {
                            rows = rows.map(row => ({
                                id: row.id,
                                content_preview: Object.prototype.hasOwnProperty.call(row, 'content_preview')
                                    ? row.content_preview
                                    : String(row.content || '').slice(0, 800),
                                content_size: Object.prototype.hasOwnProperty.call(row, 'content_size')
                                    ? row.content_size
                                    : String(row.content || '').length,
                                created_at: row.created_at,
                                updated_at: row.updated_at
                            }));
                        } else if (query.columns === 'content,updated_at') {
                            rows = rows.map(row => ({
                                content: row.content,
                                updated_at: row.updated_at
                            }));
                        }

                        return Promise.resolve({
                            data: rows,
                            count: query.options && query.options.count ? count : null
                        });
                    };
                    const builder = {
                        eq(column, value) {
                            query.filters.push({ op: 'eq', column, value });
                            return builder;
                        },
                        lt(column, value) {
                            query.filters.push({ op: 'lt', column, value });
                            return builder;
                        },
                        order(column, options) {
                            query.order = { column, options };
                            calls.orders.push({ column, options });
                            return builder;
                        },
                        limit(count) {
                            query.limit = count;
                            return runQuery();
                        },
                        range(from, to) {
                            query.range = { from, to };
                            return runQuery();
                        }
                    };
                    return builder;
                },
                upsert(rows) {
                    calls.inserts.push(rows);
                    return {
                        select() {
                            return Promise.resolve({
                                data: rows.map((row, index) => ({
                                    id: `inserted-${index}`,
                                    created_at: '2026-06-29T00:00:00Z',
                                    updated_at: '2026-06-29T00:00:00Z',
                                    ...row
                                }))
                            });
                        }
                    };
                },
                update(values) {
                    return {
                        eq(column, value) {
                            calls.updates.push({ values, column, value });
                            return {
                                select() {
                                    return Promise.resolve({
                                        data: [{ id: value, created_at: '2026-06-29T00:00:00Z', ...values }]
                                    });
                                }
                            };
                        }
                    };
                },
                delete() {
                    return {
                        eq(column, value) {
                            calls.deletes.push({ column, value });
                            return Promise.resolve({ data: null });
                        }
                    };
                }
            };
        },
        channel(name) {
            assert.equal(name, 'logs');
            const channel = {
                on(event, filter, handler) {
                    calls.subscriptions.push({ event, filter });
                    realtimeHandler = handler;
                    return channel;
                },
                subscribe(callback) {
                    callback('SUBSCRIBED');
                    return channel;
                }
            };
            return channel;
        },
        removeChannel() {}
    };

    client.emitRealtime = (payload) => realtimeHandler(payload);
    return client;
}

async function settle() {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve => setImmediate(resolve));
}

function makeLogs(count) {
    const start = Date.parse('2026-06-29T12:00:00Z');
    return Array.from({ length: count }, (_, index) => {
        const createdAt = new Date(start - index * 60000).toISOString();
        return {
            id: `log-${index}`,
            content: `log ${index}`,
            created_at: createdAt,
            updated_at: createdAt
        };
    });
}

test('loads logs from the mock client without touching the network', async () => {
    const harness = createHarness();
    const client = createMockClient([
        { id: 'a', content: 'first', created_at: '2026-06-29T00:00:00Z', updated_at: '2026-06-29T00:00:00Z' }
    ]);

    harness.setClient(client);
    const manager = new harness.LogManager();
    await settle();

    assert.equal(manager.logs.length, 1);
    assert.equal(client.calls.selects[0].table, 'logs_list');
    assert.equal(client.calls.orders[0].column, 'created_at');
    assert.equal(client.calls.orders[0].options.ascending, false);
    assert.deepEqual(client.calls.selects[0].range, { from: 0, to: harness.PAGE_SIZE - 1 });
    assert.equal(client.calls.subscriptions[0].filter.table, 'logs');
});

test('uses the cold-start bootstrap before issuing an SDK list query', async () => {
    const rows = makeLogs(1);
    const bootstrap = {
        used: false,
        page: Promise.resolve({ data: rows, count: null, error: null }),
        count: Promise.resolve(41)
    };
    const harness = createHarness({ bootstrap });
    const client = createMockClient([]);

    harness.setClient(client);
    const manager = new harness.LogManager();
    await settle();
    await settle();

    assert.equal(bootstrap.used, true);
    assert.equal(client.calls.selects.length, 0);
    assert.equal(manager.logs[0].id, rows[0].id);
    assert.equal(manager.totalLogs, 41);
    assert.equal(manager.totalPages, 3);
});

test('initial remote load requests the first tab page', async () => {
    const harness = createHarness();
    const rows = makeLogs(harness.PAGE_SIZE + 5);
    const client = createMockClient(rows);

    harness.setClient(client);
    const manager = new harness.LogManager();
    await settle();

    assert.equal(manager.logs.length, harness.PAGE_SIZE);
    assert.equal(manager.hasMore, true);
    assert.equal(manager.currentPage, 1);
    assert.equal(manager.totalPages, 2);
    assert.deepEqual(client.calls.selects[0].range, { from: 0, to: harness.PAGE_SIZE - 1 });
    assert.deepEqual(client.calls.selects[0].filters, []);
    assert.equal(harness.element('pagination').classList.contains('hidden'), false);
    assert.match(harness.element('pageTabs').innerHTML, /class="page-tab active" disabled>1<\/button>/);
});

test('page tabs load the selected range', async () => {
    const harness = createHarness();
    const rows = makeLogs(harness.PAGE_SIZE + 5);
    const client = createMockClient(rows);

    harness.setClient(client);
    const manager = new harness.LogManager();
    await settle();

    await manager.goToPage(2);
    await settle();

    assert.equal(manager.logs.length, 5);
    assert.equal(manager.currentPage, 2);
    assert.equal(manager.hasMore, false);
    assert.deepEqual(client.calls.selects[1].range, { from: harness.PAGE_SIZE, to: harness.PAGE_SIZE * 2 - 1 });
    assert.equal(harness.element('nextPageBtn').disabled, true);
});

test('switching page tabs replaces the timeline', async () => {
    const harness = createHarness();
    const rows = makeLogs(harness.PAGE_SIZE + 5);
    const client = createMockClient(rows);

    harness.setClient(client);
    const manager = new harness.LogManager();
    await settle();

    harness.element('timeline').insertedHtml = '';
    await manager.goToPage(2);
    await settle();

    const html = harness.element('timeline').insertedHtml;
    assert.match(html, new RegExp(`>${rows[harness.PAGE_SIZE].content}<`));
    assert.match(html, new RegExp(`>${rows[rows.length - 1].content}<`));
    assert.doesNotMatch(html, new RegExp(`>${rows[0].content}<`));
});

test('large logs render as preview and expand fetches full content on demand', async () => {
    const harness = createHarness();
    const bigContent = `<p>hello</p><img src="data:image/png;base64,${'a'.repeat(harness.PREVIEW_CHARS + 100)}">`;
    const rows = [{
        id: 'large-log',
        content: bigContent,
        created_at: '2026-06-29T00:00:00Z',
        updated_at: '2026-06-29T00:00:00Z'
    }];
    const client = createMockClient(rows);

    harness.setClient(client);
    const manager = new harness.LogManager();
    await settle();

    assert.equal(manager.logs[0].isPreview, true);
    assert.equal(client.calls.selects[0].table, 'logs_list');
    assert.doesNotMatch(harness.element('timeline').insertedHtml, /data:image\/png/);
    assert.match(harness.element('timeline').insertedHtml, /展开/);

    await manager.expand('large-log');
    await settle();

    assert.equal(manager.logs[0].isPreview, false);
    assert.equal(manager.logs[0].content, bigContent);
    assert.equal(client.calls.selects[1].table, 'logs');
    assert.equal(client.calls.selects[1].columns, 'content,updated_at');
});

test('submits a new log through the mock client only', async () => {
    const harness = createHarness();
    const client = createMockClient([]);
    harness.setClient(client);

    const manager = new harness.LogManager();
    await settle();
    harness.element('logContent').innerHTML = 'local test log';

    await manager.submit({ preventDefault() {} });

    assert.equal(client.calls.inserts.length, 1);
    assert.equal(client.calls.inserts[0][0].content, 'local test log');
});

test('queues a new log when the database client is not ready, then flushes later', async () => {
    const harness = createHarness();
    const manager = new harness.LogManager();
    await settle();

    harness.element('logContent').innerHTML = 'queued before cdn';
    await manager.submit({ preventDefault() {} });

    assert.equal(manager.logs.length, 1);
    assert.equal(manager.logs[0].content, 'queued before cdn');
    assert.equal(manager.pendingOps.length, 1);
    assert.equal(manager.pendingOps[0].type, 'insert');

    const client = createMockClient([]);
    harness.setClient(client);
    manager.connect(client);
    await settle();
    await settle();

    assert.equal(client.calls.inserts.length, 1);
    assert.equal(client.calls.inserts[0][0].content, 'queued before cdn');
    assert.equal(manager.pendingOps.length, 0);
    assert.match(manager.logs[0].id, /^[0-9a-f-]{36}$/);
});

test('deleting a local queued log removes the pending insert without a database call', async () => {
    const harness = createHarness();
    const manager = new harness.LogManager();
    await settle();

    harness.element('logContent').innerHTML = 'remove me locally';
    await manager.submit({ preventDefault() {} });
    const localId = manager.logs[0].id;

    manager.showModal(localId);
    await manager.doDelete();

    assert.equal(manager.logs.length, 0);
    assert.equal(manager.pendingOps.length, 0);
});

test('realtime insert de-duplicates existing logs', async () => {
    const harness = createHarness();
    const client = createMockClient([]);
    harness.setClient(client);

    const manager = new harness.LogManager();
    await settle();

    const payload = {
        eventType: 'INSERT',
        new: {
            id: 'same-id',
            content: 'from realtime',
            created_at: '2026-06-29T00:00:00Z',
            updated_at: '2026-06-29T00:00:00Z'
        }
    };

    client.emitRealtime(payload);
    client.emitRealtime(payload);

    assert.equal(manager.logs.length, 1);
    assert.equal(manager.logs[0].id, 'same-id');
});

test('renders log content without leading template indentation', async () => {
    const harness = createHarness();
    const manager = new harness.LogManager();
    await settle();

    manager.logs = [{
        id: 'plain-log',
        content: 'first line<br>second line',
        created_at: '2026-06-29T00:00:00Z',
        updated_at: '2026-06-29T00:00:00Z'
    }];
    manager.render();

    const html = harness.element('timeline').insertedHtml;
    assert.match(html, /<div style="flex:1" class="timeline-body">first line<br>second line<\/div>/);
});

test('old image format conversion escapes text content', () => {
    const harness = createHarness();
    const manager = Object.create(harness.LogManager.prototype);
    const html = manager.convertOldFormat('<b>x</b>|||IMG|||["data:image/png;base64,abc"]');

    assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
    assert.match(html, /<img src="data:image\/png;base64,abc">/);
});


test('storage failure preserves editor content and does not enqueue a false success', async () => {
    const h = createHarness({ quotaError: true });
    const manager = new h.LogManager();
    h.element('logContent').innerHTML = '<p>must not disappear</p>';
    await manager.submit();
    assert.equal(h.element('logContent').innerHTML, '<p>must not disappear</p>');
    assert.equal(manager.pendingOps.length, 0);
    assert.equal(manager.logs.length, 0);
});

test('SDK error response retains the durable operation', async () => {
    const h = createHarness();
    const manager = new h.LogManager();
    h.network.maxRetries = 1;
    h.setClient({ from() { return { upsert() { return { select: async () => ({ error: new Error('failed') }) }; } }; } });
    const op = manager.makeOp('insert', { localId: 'local-test', content: 'draft' });
    await manager.syncOp(op);
    assert.equal(manager.pendingOps.length, 1);
    assert.equal(JSON.parse(h.storage.get('logs_pending_ops'))[0].content, 'draft');
});

test('lost insert acknowledgement reuses the persisted UUID with ignore-duplicates', async () => {
    const h = createHarness();
    const manager = new h.LogManager();
    h.network.maxRetries = 1;
    const saved = new Map();
    const ids = [];
    let lose = true;
    h.setClient({ from() { return {
        upsert(rows, options) {
            assert.equal(options.ignoreDuplicates, true);
            const row = rows[0]; ids.push(row.id);
            const duplicate = saved.has(row.id);
            if (!duplicate) saved.set(row.id, { ...row, updated_at: '2026-01-01' });
            return { select: async () => {
                if (lose) { lose = false; throw new Error('lost response'); }
                return { data: duplicate ? [] : [saved.get(row.id)] };
            } };
        },
        select() { return { eq: async (_, id) => ({ data: [saved.get(id)] }) }; }
    }; } });
    const op = manager.makeOp('insert', { localId: 'local-retry', content: 'only once' });
    await manager.syncOp(op);
    assert.equal(manager.pendingOps.length, 1);
    await manager.flushPending();
    assert.equal(saved.size, 1);
    assert.equal(ids[0], ids[1]);
    assert.equal(manager.pendingOps.length, 0);
});

test('pending insert is reconstructed even if the list cache was never written', () => {
    const h = createHarness();
    h.storage.set('logs_pending_ops', JSON.stringify([{ opId: 'op-recover', type: 'insert', localId: 'local-recover', remoteId: 'stable-id', content: 'recovered draft' }]));
    const manager = new h.LogManager();
    assert.equal(manager.logs[0].content, 'recovered draft');
});
