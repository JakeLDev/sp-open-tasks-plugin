// Loads the pane script from index.html into a vm context with a tiny fake DOM and a fake
// PluginAPI. No dependencies. The fake API rejects bad payloads the way Super Productivity does.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
export const paneSource = html.match(/<script>([\s\S]*)<\/script>/)[1];
export const pageHtml = html;

class FakeEl {
  constructor(tag) {
    this.tagName = tag; this.className = ''; this.children = []; this.attrs = {}; this.listeners = {};
    this.style = {}; this._text = ''; this.disabled = false; this.hidden = false; this.value = '';
    this.classList = { add: (c) => { this.className = (this.className + ' ' + c).trim(); } };
  }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  fire(type, ev = {}) { for (const fn of this.listeners[type] || []) fn({ preventDefault() {}, ...ev }); }
  hasClass(c) { return this.className.split(/\s+/).includes(c); }
  find(pred, out = []) { if (pred(this)) out.push(this); this.children.forEach((c) => c.find(pred, out)); return out; }
}

/**
 * Mirrors the check Super Productivity runs on updateTask payloads. The real app rejected
 * `doneOn: null` with "invalid type on $input.doneOn, expect to be (number | undefined)".
 */
export function validateTaskUpdate(updates) {
  if ('isDone' in updates && typeof updates.isDone !== 'boolean') throw new Error('invalid type on $input.isDone, expect to be boolean');
  if ('doneOn' in updates && updates.doneOn !== undefined && typeof updates.doneOn !== 'number') {
    throw new Error('Error on typia.assert(): invalid type on $input.doneOn, expect to be (number | undefined)');
  }
}

export async function loadPane({ tasks = [], projects = [], withSelectTask = true, parent, synced = {} } = {}) {
  const els = {};
  const document = {
    getElementById: (id) => (els[id] = els[id] || new FakeEl(id)),
    createElement: (tag) => new FakeEl(tag),
  };
  const calls = { updateTask: [], selectTask: [], persist: [] };
  const store = JSON.parse(JSON.stringify(tasks));
  const PluginAPI = {
    getTasks: async () => JSON.parse(JSON.stringify(store)),
    getAllProjects: async () => projects,
    updateTask: async (id, updates) => {
      validateTaskUpdate(updates);
      calls.updateTask.push([id, updates]);
      Object.assign(store.find((t) => t.id === id), updates);
    },
    persistDataSynced: async (data, key) => { calls.persist.push([key, data]); synced[key] = data; },
    loadSyncedData: async (key) => synced[key] ?? null,
  };
  if (withSelectTask) PluginAPI.selectTask = async (id) => { calls.selectTask.push(id); };

  const ctx = vm.createContext({
    document, PluginAPI, window: { addEventListener() {}, parent }, console,
    setInterval: () => 0, setTimeout: () => 0, clearTimeout() {},
  });
  vm.runInContext(paneSource, ctx);
  const settle = () => new Promise((r) => setImmediate(r));
  await settle();
  return { ctx, els, calls, store, synced, settle, root: els.out };
}

export const task = (over) => ({ id: 'x', title: 'T', isDone: false, projectId: 'A', timeSpent: 0, timeEstimate: 0, tagIds: [], ...over });
