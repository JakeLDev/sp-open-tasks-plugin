import test from 'node:test';
import assert from 'node:assert';
import { loadPane, task, validateTaskUpdate, pageHtml } from './harness.mjs';

const projects = [{ id: 'A', title: 'Alpha' }, { id: 'B', title: 'Beta' }];

test('buildModel: groups by project order, numbered steps first, then unnumbered in original order', async () => {
  const { ctx } = await loadPane();
  const tasks = [
    task({ id: '1', title: 'plain one', projectId: 'B' }),
    task({ id: '2', title: '#2 second', projectId: 'A' }),
    task({ id: '3', title: 'plain two', projectId: 'A' }),
    task({ id: '4', title: '#1 first', projectId: 'A' }),
  ];
  const m = ctx.buildModel(tasks, projects, '', '2026-10-12');
  assert.deepEqual(m.groups.map((g) => g.name), ['Alpha', 'Beta']);
  assert.deepEqual(m.groups[0].items.map((i) => i.task.id), ['4', '2', '3']);
});

test('buildModel: subtasks nest under an open parent, done tasks are hidden', async () => {
  const { ctx } = await loadPane();
  const tasks = [
    task({ id: 'p', title: 'parent' }),
    task({ id: 's1', title: 'sub open', parentId: 'p' }),
    task({ id: 's2', title: 'sub done', parentId: 'p', isDone: true }),
    task({ id: 'd', title: 'done top', isDone: true }),
  ];
  const m = ctx.buildModel(tasks, projects, '', '2026-10-12');
  assert.strictEqual(m.topCount, 1);
  assert.strictEqual(m.subCount, 1);
  assert.deepEqual(m.groups[0].items[0].subs.map((s) => s.id), ['s1']);
});

test('buildModel: an open subtask whose parent is done is shown as a top-level task', async () => {
  const { ctx } = await loadPane();
  const tasks = [task({ id: 'p', isDone: true }), task({ id: 's', title: 'orphan', parentId: 'p' })];
  const m = ctx.buildModel(tasks, projects, '', '2026-10-12');
  assert.deepEqual(m.groups[0].items.map((i) => i.task.id), ['s']);
});

test('buildModel: due section holds overdue and today, oldest first, and flags blocked parents', async () => {
  const { ctx } = await loadPane();
  const tasks = [
    task({ id: 'a', dueDay: '2026-10-12' }),
    task({ id: 'b', dueDay: '2026-10-01' }),
    task({ id: 'c', dueDay: '2026-10-13' }),
    task({ id: 'k', parentId: 'a', title: 'kid' }),
  ];
  const m = ctx.buildModel(tasks, projects, '', '2026-10-12');
  assert.deepEqual(m.due.map((d) => d.task.id), ['b', 'a']);
  assert.strictEqual(m.due.find((d) => d.task.id === 'a').blocked, true);
  assert.strictEqual(m.due.find((d) => d.task.id === 'b').blocked, false);
});

test('buildModel: the filter matches title, notes and subtask titles', async () => {
  const { ctx } = await loadPane();
  const tasks = [
    task({ id: '1', title: 'alpha' }),
    task({ id: '2', title: 'beta', notes: 'mentions SONAR here' }),
    task({ id: '3', title: 'gamma' }),
    task({ id: '4', title: 'child sonar', parentId: '3' }),
  ];
  const ids = (q) => ctx.buildModel(tasks, projects, q, '2026-10-12').groups.flatMap((g) => g.items.map((i) => i.task.id));
  assert.deepEqual(ids('sonar'), ['2', '3']);
  assert.deepEqual(ids('ALPHA'), ['1']);
});

test('marking done sends isDone true and a numeric doneOn, then reloads the list', async () => {
  const { ctx, calls } = await loadPane({ tasks: [task({ id: 't', title: 'Do it' })], projects });
  await ctx.setDone({ id: 't', title: 'Do it' }, true);
  assert.strictEqual(calls.updateTask.length, 1);
  const [id, payload] = calls.updateTask[0];
  assert.strictEqual(id, 't');
  assert.strictEqual(payload.isDone, true);
  assert.strictEqual(typeof payload.doneOn, 'number');
});

test('REGRESSION undo: payload passes the API check (doneOn must be a number or undefined, never null)', async () => {
  const { ctx, calls, els } = await loadPane({ tasks: [task({ id: 't', title: 'Do it', isDone: true, doneOn: 123 })], projects });
  await ctx.setDone({ id: 't', title: 'Do it' }, false);
  assert.strictEqual(calls.updateTask.length, 1, 'the undo update was rejected by the API check');
  const payload = calls.updateTask[0][1];
  assert.strictEqual(payload.isDone, false);
  assert.notStrictEqual(payload.doneOn, null);
  assert.doesNotThrow(() => validateTaskUpdate(payload));
  assert.ok(!/Could not update/.test(els['toast-text']?.textContent ?? ''));
});

test('the fake API check itself rejects doneOn null (so the regression test can fail)', () => {
  assert.throws(() => validateTaskUpdate({ isDone: false, doneOn: null }), /doneOn/);
});

test('an API error shows a toast instead of failing silently', async () => {
  const { ctx, els } = await loadPane({ tasks: [task({ id: 't' })], projects });
  ctx.PluginAPI.updateTask = async () => { throw new Error('boom'); };
  await ctx.setDone({ id: 't', title: 'X' }, true);
  assert.match(els['toast-text'].textContent, /Could not update task: boom/);
});

test('checkboxes: leaf tasks are enabled, parents with open subtasks are disabled', async () => {
  const tasks = [task({ id: 'p', title: 'parent' }), task({ id: 's', title: 'kid', parentId: 'p' }), task({ id: 'l', title: 'leaf' })];
  const { root } = await loadPane({ tasks, projects });
  const boxes = root.find((e) => e.hasClass('check'));
  const byLabel = Object.fromEntries(boxes.map((b) => [b.attrs['aria-label'], b]));
  assert.strictEqual(byLabel['Mark done: parent'].disabled, true);
  assert.strictEqual(byLabel['Mark done: leaf'].disabled, false);
});

test('ticking a checkbox marks that task done', async () => {
  const { root, calls, settle } = await loadPane({ tasks: [task({ id: 'l', title: 'leaf' })], projects });
  const box = root.find((e) => e.hasClass('check'))[0];
  box.fire('change');
  await settle();
  assert.deepEqual(calls.updateTask.map((c) => [c[0], c[1].isDone]), [['l', true]]);
});

test('clicking a title opens the task panel, for tasks and subtasks', async () => {
  const tasks = [task({ id: 'p', title: 'parent' }), task({ id: 's', title: 'kid', parentId: 'p' })];
  const { ctx, root, calls, settle } = await loadPane({ tasks, projects });
  root.find((e) => e.hasClass('title') && e.hasClass('open'))[0].fire('click');
  ctx.expanded.p = true; ctx.render();
  const subTitle = root.find((e) => e.hasClass('sub'))[0].find((e) => e.hasClass('open'))[0];
  subTitle.fire('click');
  await settle();
  assert.deepEqual(calls.selectTask, ['p', 's']);
});

test('when selectTask is missing the pane says so', async () => {
  const { ctx, els } = await loadPane({ tasks: [task({ id: 'l' })], projects, withSelectTask: false });
  await ctx.openTask('l');
  assert.match(els.updated.textContent, /cannot open the task panel/);
});

test('only http(s) links are rendered as links', async () => {
  const tasks = [task({ id: 'l', attachments: [
    { type: 'LINK', title: 'ok', path: 'https://example.com/a' },
    { type: 'LINK', title: 'bad', path: 'javascript:alert(1)' },
    { type: 'FILE', title: 'file', path: 'https://example.com/f' },
  ] })];
  const { root } = await loadPane({ tasks, projects });
  const links = root.find((e) => e.tagName === 'a');
  assert.deepEqual(links.map((l) => l.href), ['https://example.com/a']);
});

test('task text is never put in markup: no innerHTML in the page', () => {
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(pageHtml));
});

test('a missing PluginAPI shows an error instead of a blank pane', async () => {
  const { ctx, els } = await loadPane();
  delete ctx.PluginAPI;
  await ctx.load(true);
  assert.match(els.out.textContent, /Could not load tasks/);
});

test('expand all shows notes and subtasks of every task, collapse all hides them', async () => {
  const tasks = [task({ id: 'p', title: 'parent' }), task({ id: 's', title: 'kid', parentId: 'p' }), task({ id: 'n', title: 'noted', notes: 'hi' })];
  const { els, root } = await loadPane({ tasks, projects });
  const details = () => root.find((e) => e.hasClass('details')).length;
  assert.strictEqual(details(), 0);
  els['expand-all'].fire('click');
  assert.strictEqual(details(), 2);
  els['collapse-all'].fire('click');
  assert.strictEqual(details(), 0);
});

test('clicking a project name opens that project in the app', async () => {
  const clicked = [];
  const parent = { document: { createElement: () => ({ click() { clicked.push(this.href); } }) } };
  const tasks = [task({ id: 't', projectId: 'A' }), task({ id: 'u', projectId: undefined })];
  const { root, els } = await loadPane({ tasks, projects, parent });
  const names = root.find((e) => e.tagName === 'h2').map((h) => h.children[1]);
  assert.deepEqual(names.map((n) => n.textContent), ['Alpha', 'No project']);
  assert.ok(!names[1].hasClass('open'));
  names[0].fire('click');
  assert.deepEqual(clicked, ['#/project/A/tasks']);

  const broken = await loadPane({ tasks, projects });
  broken.root.find((e) => e.tagName === 'h2')[0].children[1].fire('click');
  assert.match(broken.els.updated.textContent, /Could not open project/);
});

test('a project can be collapsed to hide its tasks, and expand all opens it again', async () => {
  const tasks = [task({ id: 'a', title: 'in alpha', projectId: 'A' }), task({ id: 'b', title: 'in beta', projectId: 'B' })];
  const { root, els } = await loadPane({ tasks, projects });
  const shown = () => root.find((e) => e.hasClass('task')).map((t) => t.textContent);
  assert.deepEqual(shown(), ['in alpha', 'in beta']);
  root.find((e) => e.tagName === 'h2')[0].children[0].fire('click');
  assert.deepEqual(shown(), ['in beta']);
  assert.match(root.find((e) => e.tagName === 'h2')[0].textContent, /Alpha \(1\)/);
  els['expand-all'].fire('click');
  assert.deepEqual(shown(), ['in alpha', 'in beta']);
});

test('orderedItems: saved ids first in saved order, then the rest in by-project order', async () => {
  const { ctx } = await loadPane();
  const tasks = [task({ id: 'a', projectId: 'A' }), task({ id: 'b', projectId: 'A' }), task({ id: 'c', projectId: 'B' })];
  const groups = ctx.buildModel(tasks, projects, '', '2026-10-12').groups;
  const ids = (saved) => ctx.orderedItems(groups, saved).map((i) => i.task.id + '@' + i.project);
  assert.deepEqual(ids([]), ['a@Alpha', 'b@Alpha', 'c@Beta']);
  assert.deepEqual(ids(['c', 'gone', 'a']), ['c@Beta', 'a@Alpha', 'b@Alpha']);
});

test('my order: the pane opens by project, and the order tab moves and saves tasks', async () => {
  const tasks = [task({ id: 'a', title: 'one', projectId: 'A' }), task({ id: 'b', title: 'two', projectId: 'B' }), task({ id: 'd', title: 'done', isDone: true })];
  const { root, els, calls, synced } = await loadPane({ tasks, projects });
  assert.strictEqual(root.find((e) => e.tagName === 'h2').length, 2);
  els['tab-order'].fire('click');
  const titles = () => root.find((e) => e.hasClass('title')).map((t) => t._text);
  assert.deepEqual(titles(), ['one', 'two']);
  root.find((e) => e.attrs['aria-label'] === 'Move down: one')[0].fire('click');
  assert.deepEqual(titles(), ['two', 'one']);
  assert.deepEqual(JSON.parse(synced['my-order']).ids, ['b', 'a']);
  assert.strictEqual(calls.persist.length, 1);
});

test('my order: a saved order is loaded on start, and drag and drop moves a task', async () => {
  const tasks = [task({ id: 'a', title: 'one' }), task({ id: 'b', title: 'two' }), task({ id: 'c', title: 'three' })];
  const { root, els, synced } = await loadPane({ tasks, projects, synced: { 'my-order': JSON.stringify({ ids: ['c', 'a', 'b'] }) } });
  els['tab-order'].fire('click');
  const rows = () => root.find((e) => e.hasClass('task'));
  assert.deepEqual(rows().map((r) => r.find((e) => e.hasClass('title'))[0]._text), ['three', 'one', 'two']);
  rows()[0].fire('dragstart');
  rows()[2].fire('drop');
  assert.deepEqual(JSON.parse(synced['my-order']).ids, ['a', 'b', 'c']);
});

test('the description can be cut to one line while the subtasks stay open', async () => {
  const tasks = [task({ id: 'p', title: 'parent', notes: 'long text' }), task({ id: 's', title: 'kid', parentId: 'p' })];
  const { ctx, root, els } = await loadPane({ tasks, projects });
  ctx.expanded.p = true; ctx.render();
  const notes = () => root.find((e) => e.hasClass('notes'))[0];
  assert.ok(!notes().hasClass('short'));
  root.find((e) => e.attrs['aria-label'] === 'Show full description')[0].fire('click');
  assert.ok(notes().hasClass('short'));
  assert.strictEqual(root.find((e) => e.hasClass('sub')).length, 1);
  els['expand-all'].fire('click');
  assert.ok(!notes().hasClass('short'));
});
