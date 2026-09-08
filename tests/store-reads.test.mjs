import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function setup() {
  const requests = [], writes = [];
  const reliable = {
    configure() {}, tracked: () => true,
    read(path, options) { return new Promise((resolve, reject) => requests.push({path,options,resolve,reject})); },
    async enqueue(path, data, base) { writes.push({path,data,base}); return {queued:true}; }
  };
  const context = {window:{AcademyReliable:reliable,addEventListener() {}}, navigator:{onLine:true},localStorage:{getItem:() => null},URL};
  vm.runInNewContext(readFileSync('apps/academy/framework/store.js','utf8'), context);
  return {store:context.window.AcademyStore, requests, writes};
}
test('concurrent document reads share work and return independent objects', async () => {
  const {store,requests} = setup();
  const readers = Array.from({length:8}, () => store.getJSON('academy/schedule.json'));
  assert.equal(requests.length, 1);
  requests[0].resolve({rev:1,assignments:{day:[]}});
  const values = await Promise.all(readers);
  values[0].assignments.day.push('edited');
  assert.equal(values[1].assignments.day.length, 0);
  const fresh = store.getJSON('academy/schedule.json');
  assert.equal(requests.length, 2);
  requests[1].resolve({rev:2}); await fresh;
});
test('cached reads do not wait behind a slow network read', async () => {
  const {store,requests} = setup();
  const remote = store.getJSON('academy/schedule.json');
  const local = store.getJSON('academy/schedule.json',{cached:true});
  assert.equal(requests.length, 2);
  requests[1].resolve({rev:1}); assert.equal((await local).rev, 1);
  requests[0].resolve({rev:2}); assert.equal((await remote).rev, 2);
});
test('writes invalidate readers and late reads cannot replace the write merge base', async () => {
  const {store,requests,writes} = setup();
  const old = store.getJSON('academy/schedule.json');
  await store.putJSON('academy/schedule.json',{rev:2},{base:{rev:1}});
  requests[0].resolve({rev:1}); await old;
  await store.putJSON('academy/schedule.json',{rev:3});
  assert.equal(writes[1].base.rev, 2);
  const next = store.getJSON('academy/schedule.json');
  assert.equal(requests.length, 2);
  requests[1].resolve({rev:3}); await next;
});
test('failed shared reads are removed so retries can succeed', async () => {
  const {store,requests} = setup();
  const first = store.getJSON('academy/schedule.json');
  requests[0].reject(new Error('offline'));
  await assert.rejects(first,/offline/);
  const retry = store.getJSON('academy/schedule.json');
  requests[1].resolve({rev:2}); assert.equal((await retry).rev,2);
});
