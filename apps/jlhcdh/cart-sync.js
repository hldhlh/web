// Durable per-date/product outbox. Acknowledgements only remove the exact saved
// operation, so edits made during upload survive an older response.
window.OrderCartSync = (() => {
    const prefix = 'jlhcdh-pending-v1:';
    let client, listener = () => {}, timer, running, revision = 0, attempts = 0;
    const key = (date, id) => `${prefix}${date}:${id}`;
    const read = name => JSON.parse(localStorage.getItem(name) || 'null');
    const entries = () => {
        const result = [];
        for (let i = 0; i < localStorage.length; i++) {
            const name = localStorage.key(i);
            if (name?.startsWith(prefix)) { const op = read(name); if (op) result.push(op); }
        }
        return result;
    };
    function emit(op, status) { try { listener(op, status); } catch (error) { console.warn(error); } }
    function schedule(delay = 150) {
        clearTimeout(timer);
        timer = setTimeout(() => flush().catch(error => emit(null, 'error')), delay);
    }
    function enqueue(date, id, qty, purchased, mode = 'quantity') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Number(id)) || !Number.isFinite(qty) || qty < 0) throw new Error('订货数量或日期无效');
        const previous = read(key(date,id));
        if (previous && previous.mode !== 'purchase') mode = 'quantity';
        const op = {date, id:Number(id), qty, purchased:!!purchased, mode, token:crypto.randomUUID(), updatedAt:new Date().toISOString()};
        // Do not acknowledge to the UI until durable storage succeeds.
        localStorage.setItem(`jlhcdh-cart-edited:${date}`, 'true');
        localStorage.setItem(key(date,id), JSON.stringify(op));
        revision++;
        emit(op, 'pending');
        schedule();
        return op;
    }
    function overlay(date, orders) {
        const next = {...orders};
        for (const op of entries()) if (op.date === date) {
            if (op.mode === 'purchase') { if (next[op.id]) next[op.id] = {...next[op.id],purchased:op.purchased}; }
            else if (op.qty > 0) next[op.id] = {qty:op.qty,purchased:op.purchased};
            else delete next[op.id];
        }
        return next;
    }
    async function upload(snapshot) {
        const name = key(snapshot.date,snapshot.id);
        const work = async () => {
            const op = read(name);
            if (!op) return;
            emit(op,'syncing');
            try {
                const result = op.mode === 'purchase'
                    ? await client.from('jlhcdh_cart').update({is_purchased:op.purchased,updated_at:op.updatedAt}).eq('product_id',op.id).eq('order_date',op.date)
                    : op.qty > 0
                    ? await client.from('jlhcdh_cart').upsert({product_id:op.id,order_date:op.date,quantity:op.qty,is_purchased:op.purchased,updated_at:op.updatedAt},{onConflict:'product_id,order_date'})
                    : await client.from('jlhcdh_cart').delete().eq('product_id',op.id).eq('order_date',op.date);
                if (result.error) throw result.error;
                if (read(name)?.token === op.token) {
                    localStorage.removeItem(name);
                    revision++;
                    emit(op,'saved');
                }
            } catch (error) { emit(op,'error'); throw error; }
        };
        return navigator.locks ? navigator.locks.request(name, work) : work();
    }
    async function flush() {
        if (!client || navigator.onLine === false) return;
        if (running) return running;
        running = (async () => {
            const queue = entries();
            let failed = false;
            // Bounded parallel uploads across products; each product remains ordered.
            for (let i = 0; i < queue.length; i += 4) {
                const results = await Promise.allSettled(queue.slice(i,i+4).map(upload));
                if (results.some(result => result.status === 'rejected')) failed = true;
            }
            attempts = failed ? attempts + 1 : 0;
            if (entries().length) schedule(failed ? Math.min(30000, 1000 * 2 ** Math.min(attempts,5)) : 150);
        })().finally(() => { running = null; });
        return running;
    }
    window.addEventListener('online', () => schedule(0));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(0); });
    window.addEventListener('storage', event => {
        if (event.key?.startsWith(prefix)) { revision++; emit(null,'external'); schedule(); }
    });
    return {enqueue,overlay,flush,has:(date,id)=>!!read(key(date,id)),hasDate:date=>entries().some(op=>op.date===date),
        wasEdited:date=>localStorage.getItem(`jlhcdh-cart-edited:${date}`)==='true',
        get pendingCount() { return entries().length; },
        get revision() { return revision; },
        configure(sb,onStatus) { client=sb;listener=onStatus;schedule(); }};
})();
