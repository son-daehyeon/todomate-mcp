import { autoId, TodomateError } from './client.js';

const pad = (n) => String(n).padStart(2, '0');

export function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  const ms = m && Date.UTC(+m[1], +m[2] - 1, +m[3]);
  if (!m || formatDate(ms) !== s) throw new TodomateError(`날짜는 YYYY-MM-DD 형식의 실제 날짜여야 합니다: ${s}`);
  return ms;
}

export function parseDateTime(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(s || '');
  const ms = m && new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
  if (!m || formatDateTime(ms) !== `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`) throw new TodomateError(`시각은 YYYY-MM-DD HH:mm 형식의 실제 시각이어야 합니다: ${s}`);
  return ms;
}

export const formatDate = (ms) => (ms == null ? null : new Date(ms).toISOString().slice(0, 10));

function formatDateTime(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function goals(c) {
  const list = await c.query({
    from: [{ collectionId: 'Goal' }],
    where: { fieldFilter: { field: { fieldPath: 'userID' }, op: 'EQUAL', value: { stringValue: c.uid } } },
  });
  return list.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

export async function categories(c, { includeFinished = false } = {}) {
  return (await goals(c))
    .filter((g) => includeFinished || g.finishType == null)
    .map((g) => ({ id: g.id, title: g.title, ...(g.finishType != null && { finished: true }), ...(g.crewId && { crew: true }) }));
}

async function resolveCategory(c, nameOrId) {
  const active = (await goals(c)).filter((g) => g.finishType == null);
  const byId = active.find((g) => g.id === nameOrId);
  if (byId) return byId;
  const matches = active.filter((g) => g.title === nameOrId);
  if (matches.length === 1) return matches[0];
  const names = active.map((g) => g.title).join(', ');
  if (!matches.length) throw new TodomateError(`'${nameOrId}' 카테고리가 없습니다. 사용 가능한 카테고리: ${names}`);
  throw new TodomateError(`'${nameOrId}' 카테고리가 여러 개입니다. id로 지정하세요: ${matches.map((g) => g.id).join(', ')}`);
}

function todoView(t, titles) {
  return {
    id: t.id,
    date: formatDate(t.date),
    category: titles[t.goalID] ?? t.goalID,
    content: t.content,
    done: Boolean(t.isDone),
    ...(t.remindAt && { remind_at: formatDateTime(t.remindAt) }),
    ...(t.memo && { memo: t.memo }),
    ...(t.routineID && { routine: true }),
  };
}

export async function todos(c, { start = today(), end, category } = {}) {
  const from = parseDate(start);
  const to = parseDate(end || start);
  if (to < from) throw new TodomateError('end는 start보다 빠를 수 없습니다.');
  if (to - from > 92 * 86400000) throw new TodomateError('한 번에 최대 93일까지 조회할 수 있습니다.');
  const [items, allGoals] = await Promise.all([
    c.query({
      from: [{ collectionId: 'TodoItem' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            { fieldFilter: { field: { fieldPath: 'writerID' }, op: 'EQUAL', value: { stringValue: c.uid } } },
            { fieldFilter: { field: { fieldPath: 'date' }, op: 'GREATER_THAN_OR_EQUAL', value: { integerValue: String(from) } } },
            { fieldFilter: { field: { fieldPath: 'date' }, op: 'LESS_THAN_OR_EQUAL', value: { integerValue: String(to) } } },
          ],
        },
      },
      orderBy: [{ field: { fieldPath: 'date' }, direction: 'ASCENDING' }, { field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
    }),
    goals(c),
  ]);
  const titles = Object.fromEntries(allGoals.map((g) => [g.id, g.title]));
  return items
    .filter((t) => !category || t.goalID === category || titles[t.goalID] === category)
    .map((t) => todoView(t, titles));
}

export async function addTodo(c, { content, date = today(), category, remindAt }) {
  if (!content?.trim()) throw new TodomateError('할 일 내용이 비어 있습니다.');
  const goal = await resolveCategory(c, category);
  const id = c.uid + autoId();
  const item = {
    id, routineID: null, writerID: c.uid, goalID: goal.id, content: content.trim(),
    createTime: Date.now(), date: parseDate(date), isDone: false,
    remindAt: remindAt ? parseDateTime(remindAt) : null, doneTime: null,
    likesTotalCount: null, likes: null, likesTotalSenderIDs: null, photoURL: null, hasPhoto: null,
    memo: null, isMemoPublic: null, timer: null, hasTimer: false, spentTime: null,
  };
  await c.create('TodoItem', id, item);
  return todoView(item, { [goal.id]: goal.title });
}

async function ownTodo(c, id) {
  const item = await c.get('TodoItem', id).catch((err) => {
    if (err.message.includes('(404)')) return null;
    throw err;
  });
  if (!item || item.writerID !== c.uid) throw new TodomateError(`할 일을 찾을 수 없습니다: ${id}`);
  return item;
}

export async function updateTodo(c, id, { content, date, category, done, remindAt, memo }) {
  const item = await ownTodo(c, id);
  const changes = {};
  if (content !== undefined) {
    if (!content.trim()) throw new TodomateError('할 일 내용이 비어 있습니다.');
    changes.content = content.trim();
  }
  if (date !== undefined) changes.date = parseDate(date);
  if (category !== undefined) changes.goalID = (await resolveCategory(c, category)).id;
  if (memo !== undefined) changes.memo = memo || null;
  if (remindAt !== undefined) changes.remindAt = remindAt ? parseDateTime(remindAt) : null;
  if (done === true && !item.isDone) Object.assign(changes, { isDone: true, doneTime: Date.now(), timer: null, hasTimer: false });
  if (done === false) changes.isDone = false;
  if (!Object.keys(changes).length) throw new TodomateError('바꿀 내용이 없습니다.');
  await c.update('TodoItem', id, changes);
  const titles = Object.fromEntries((await goals(c)).map((g) => [g.id, g.title]));
  return todoView({ ...item, ...changes }, titles);
}

export async function deleteTodo(c, id) {
  const item = await ownTodo(c, id);
  await c.remove('TodoItem', id);
  return { deleted: id, content: item.content, date: formatDate(item.date) };
}
