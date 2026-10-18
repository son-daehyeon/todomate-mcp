import assert from 'node:assert/strict';
import { Client } from './client.js';
import * as t from './todomate.js';

const c = new Client();
const step = async (name, fn) => {
  const r = await fn();
  console.log(`ok  ${name}`);
  return r;
};

assert.equal(t.formatDate(t.parseDate('2026-10-18')), '2026-10-18');
assert.throws(() => t.parseDate('10/18'));
assert.throws(() => t.parseDate('2026-02-31'));
assert.throws(() => t.parseDateTime('2026-10-18 24:30'));

const cats = await step('list_categories', () => t.categories(c));
assert(cats.length > 0 && cats.every((x) => !x.finished));
const all = await step('list_categories include_finished', () => t.categories(c, { includeFinished: true }));
assert(all.length >= cats.length);

const day = t.today();
const week = await step('list_todos', () => t.todos(c, { start: day, end: t.formatDate(t.parseDate(day) + 6 * 86400000) }));
assert(week.every((x) => x.id && x.date >= day && typeof x.done === 'boolean'));

const category = cats[0].title;
const added = await step('add_todo', () => t.addTodo(c, { content: '[MCP 테스트] 곧 삭제됩니다', category, date: day, remindAt: `${day} 23:50` }));
try {
  assert(added.id.startsWith(c.uid) && added.remind_at === `${day} 23:50`);
  assert((await t.todos(c, { start: day })).some((x) => x.id === added.id));
  const done = await step('update_todo done', () => t.updateTodo(c, added.id, { done: true, remindAt: null }));
  assert(done.done && !done.remind_at);
  const tomorrow = t.formatDate(t.parseDate(day) + 86400000);
  const moved = await step('update_todo move', () => t.updateTodo(c, added.id, { date: tomorrow, done: false, content: '[MCP 테스트] 이동됨' }));
  assert(moved.date === tomorrow && !moved.done && moved.content === '[MCP 테스트] 이동됨');
  await assert.rejects(t.addTodo(c, { content: 'x', category: '없는카테고리-테스트' }));
} finally {
  await step('delete_todo', () => t.deleteTodo(c, added.id));
}
await assert.rejects(t.deleteTodo(c, added.id));
console.log('\nall checks passed');
