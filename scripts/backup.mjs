/**
 * Бэкап базы «Личного инфо»: таблицы в JSON + все файлы хранилища.
 *
 * Запуск из корня проекта:
 *   node scripts/backup.mjs [папка]           # по умолчанию ~/lichnoe-info-backups/<дата>
 *
 * Адрес и ключ читаются из .env.local. История правок (block_revisions)
 * закрыта правами: чтобы она попала в бэкап, передайте вход редактора:
 *   BACKUP_EMAIL=... BACKUP_PASSWORD=... node scripts/backup.mjs
 * Без него бэкапится всё остальное, а история пропускается с предупреждением.
 *
 * Восстановление: schema.sql создаёт пустую базу, дальше содержимое JSON
 * заливается через Supabase (Table Editor → Insert, или скриптом), файлы —
 * в бакет notes с теми же путями.
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'

// ─── Настройки из .env.local ────────────────────────────────────────────────
const env = {}
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
  if (m) env[m[1]] = m[2]
}
const URL_BASE = env.VITE_SUPABASE_URL
const KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY
if (!URL_BASE || !KEY) {
  console.error('Не нашёл VITE_SUPABASE_URL / ключ в .env.local')
  process.exit(1)
}

const stamp = new Date().toISOString().slice(0, 10)
const OUT = process.argv[2] || join(homedir(), 'lichnoe-info-backups', stamp)
mkdirSync(join(OUT, 'data'), { recursive: true })
mkdirSync(join(OUT, 'storage'), { recursive: true })

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` }

// ─── Вход редактора (для истории правок) ────────────────────────────────────
let editorToken = null
if (process.env.BACKUP_EMAIL && process.env.BACKUP_PASSWORD) {
  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.BACKUP_EMAIL, password: process.env.BACKUP_PASSWORD }),
  })
  const auth = await res.json()
  if (auth.access_token) editorToken = auth.access_token
  else console.warn('Вход редактора не удался:', auth.error_description || auth.msg || res.status)
}

// ─── Таблицы: страницами по 1000 строк ──────────────────────────────────────
async function dumpTable(table, { auth = false } = {}) {
  const h = auth && editorToken ? { apikey: KEY, Authorization: `Bearer ${editorToken}` } : headers
  const rows = []
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${URL_BASE}/rest/v1/${table}?select=*&order=id&limit=1000&offset=${offset}`, { headers: h })
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`)
    const chunk = await res.json()
    rows.push(...chunk)
    if (chunk.length < 1000) break
  }
  writeFileSync(join(OUT, 'data', `${table}.json`), JSON.stringify(rows, null, 1))
  console.log(`  ${table}: ${rows.length} строк`)
  return rows.length
}

console.log('Таблицы:')
await dumpTable('nodes')
await dumpTable('blocks')
await dumpTable('app_settings')
if (editorToken) {
  await dumpTable('block_revisions', { auth: true })
} else {
  console.warn('  block_revisions: ПРОПУЩЕНА — нужен вход редактора (BACKUP_EMAIL / BACKUP_PASSWORD)')
}

// ─── Хранилище: обходим папки и качаем файлы ────────────────────────────────
async function listFolder(prefix) {
  const out = []
  for (let offset = 0; ; offset += 100) {
    const res = await fetch(`${URL_BASE}/storage/v1/object/list/notes`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: 'name', order: 'asc' } }),
    })
    if (!res.ok) throw new Error(`storage list: HTTP ${res.status}`)
    const chunk = await res.json()
    for (const entry of chunk) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.id) out.push(path)
      else out.push(...(await listFolder(path))) // папка — заходим внутрь
    }
    if (chunk.length < 100) break
  }
  return out
}

console.log('Хранилище:')
const files = await listFolder('')
let saved = 0
let bytes = 0
for (const path of files) {
  const res = await fetch(`${URL_BASE}/storage/v1/object/public/notes/${path}`)
  if (!res.ok) {
    console.warn(`  не скачался: ${path} (HTTP ${res.status})`)
    continue
  }
  const buf = Buffer.from(await res.arrayBuffer())
  const target = join(OUT, 'storage', path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, buf)
  saved++
  bytes += buf.length
}
console.log(`  файлов: ${saved} из ${files.length}, ${(bytes / 1024 / 1024).toFixed(1)} МБ`)

writeFileSync(
  join(OUT, 'ЧТО-ЭТО.txt'),
  `Бэкап «Личного инфо» от ${new Date().toLocaleString('ru-RU')}
data/     — таблицы базы в JSON (nodes — дерево, blocks — тексты, block_revisions — история)
storage/  — все фотографии из хранилища, пути совпадают с адресами в базе
Схема базы — supabase/schema.sql в репозитории.
Восстановление: прогнать schema.sql в новом проекте, залить JSON и файлы обратно.
`,
)

console.log(`\nГотово: ${OUT}`)
