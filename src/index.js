#!/usr/bin/env node
import path from 'node:path';
import { spawn } from 'node:child_process';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Client, CONFIG_DIR, saveCredentials } from './client.js';
import * as t from './todomate.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const READ_FIREBASE_USER = `new Promise((resolve) => {
  const req = indexedDB.open('firebaseLocalStorageDb');
  req.onerror = () => resolve(null);
  req.onsuccess = () => {
    try {
      const get = req.result.transaction('firebaseLocalStorage', 'readonly').objectStore('firebaseLocalStorage').getAll();
      get.onsuccess = () => resolve(get.result.find((x) => String(x.fbase_key).startsWith('firebase:authUser'))?.value ?? null);
      get.onerror = () => resolve(null);
    } catch { resolve(null); }
  };
})`;

async function evaluate(wsUrl, expression) {
  const ws = new WebSocket(wsUrl);
  let timer;
  try {
    return await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), 5000);
      ws.onerror = reject;
      ws.onmessage = (m) => {
        const data = JSON.parse(m.data);
        if (data.id === 1) resolve(data.result?.result?.value);
      };
      ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
    });
  } finally {
    clearTimeout(timer);
    ws.close();
  }
}

async function login() {
  const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const port = 9339;
  const proc = spawn(chrome, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${path.join(CONFIG_DIR, 'chrome-profile')}`,
    '--no-first-run', '--no-default-browser-check', '--window-size=480,900', 'https://todomate.net/',
  ], { stdio: 'ignore' });
  let exited = false;
  proc.on('exit', () => { exited = true; });
  proc.on('error', (err) => { console.error(`크롬을 실행할 수 없습니다 (${err.message}). CHROME_PATH를 지정하세요.`); process.exit(1); });
  console.log('열린 크롬 창에서 투두메이트에 로그인하세요. (최대 10분 대기)');
  try {
    for (let i = 0; i < 300 && !exited; i++) {
      await sleep(2000);
      const pages = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) }).then((r) => r.json(), () => []);
      const page = pages.find((p) => p.type === 'page' && p.url.startsWith('https://todomate.net/'));
      if (!page) continue;
      const user = await evaluate(page.webSocketDebuggerUrl, READ_FIREBASE_USER).catch(() => null);
      if (!user?.stsTokenManager?.refreshToken) continue;
      const credentials = { uid: user.uid, email: user.email, refreshToken: user.stsTokenManager.refreshToken };
      const categories = await t.categories(new Client(credentials)).catch(() => null);
      if (!categories) continue;
      saveCredentials(credentials);
      console.log(`로그인 성공: ${user.email} (카테고리 ${categories.length}개)`);
      return;
    }
    throw new Error(exited ? '로그인 전에 크롬이 종료되었습니다.' : '10분 안에 로그인하지 않았습니다.');
  } finally {
    proc.kill();
  }
}

if (process.argv[2] === 'login') {
  await login().catch((err) => { console.error(err.message); process.exit(1); });
  process.exit(0);
}

process.on('unhandledRejection', (err) => console.error(err));

let client;
const getClient = () => (client ||= new Client());
const server = new McpServer({ name: 'todomate', version: '0.1.0' });

function tool(name, description, inputSchema, run, readOnly = false) {
  server.registerTool(name, { description, inputSchema, annotations: { readOnlyHint: readOnly, openWorldHint: true } }, async (args) => {
    try {
      return { content: [{ type: 'text', text: JSON.stringify(await run(getClient(), args), null, 1) }] };
    } catch (err) {
      client = null;
      return { isError: true, content: [{ type: 'text', text: err.message }] };
    }
  });
}

const date = (d) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe(d);
const dateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/);
const todoId = z.string().describe('list_todos의 id');

tool('list_categories', '투두메이트 카테고리(목표) 목록. 기본은 진행 중인 카테고리만.',
  { include_finished: z.boolean().optional().describe('종료된 카테고리도 포함') },
  (c, a) => t.categories(c, { includeFinished: a.include_finished }), true);

tool('list_todos', '기간의 할 일 목록 (날짜순). 기본은 오늘 하루. 최대 93일.',
  {
    start: date('시작일 YYYY-MM-DD (기본 오늘)').optional(),
    end: date('종료일 YYYY-MM-DD (기본 start와 같음)').optional(),
    category: z.string().optional().describe('카테고리 이름이나 id로 거르기'),
  },
  (c, a) => t.todos(c, a), true);

tool('add_todo', '할 일을 추가한다.',
  {
    content: z.string().describe('할 일 내용'),
    category: z.string().describe('카테고리 이름 또는 id (list_categories)'),
    date: date('날짜 YYYY-MM-DD (기본 오늘)').optional(),
    remind_at: dateTime.optional().describe('알림 시각 YYYY-MM-DD HH:mm'),
  },
  (c, a) => t.addTodo(c, { content: a.content, category: a.category, date: a.date, remindAt: a.remind_at }));

tool('update_todo', '할 일을 수정한다: 완료/미완료, 내용, 날짜 이동, 카테고리, 알림(null이면 해제), 메모.',
  {
    todo_id: todoId,
    done: z.boolean().optional(),
    content: z.string().optional(),
    date: date('옮길 날짜 YYYY-MM-DD').optional(),
    category: z.string().optional(),
    remind_at: dateTime.nullable().optional().describe('알림 시각 YYYY-MM-DD HH:mm, null이면 알림 해제'),
    memo: z.string().optional(),
  },
  (c, a) => t.updateTodo(c, a.todo_id, { content: a.content, date: a.date, category: a.category, done: a.done, remindAt: a.remind_at, memo: a.memo }));

tool('delete_todo', '할 일을 삭제한다.', { todo_id: todoId }, (c, a) => t.deleteTodo(c, a.todo_id));

await server.connect(new StdioServerTransport());
