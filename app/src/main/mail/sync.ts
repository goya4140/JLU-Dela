// 邮件同步：同步状态广播、按文件夹拉取最近窗口的头信息与预取正文，
// 以及账号配置/断开（二者都会使进行中的同步失效）。
import { BrowserWindow } from 'electron';
import type { ImapFlow } from 'imapflow';
import { z } from 'zod';
import type { MailAddress, MailConfigureInput, MailResult, MailSyncStatus } from '../../shared/api';
import { JLU_MAIL_SERVER } from '../../shared/mail';
import { getDatabase } from '../database';
import { clearMailCredentials, loadMailCredentials, saveMailCredentials } from '../credentials';
import {
  addressJson,
  collectAttachments,
  downloadMessageBody,
  makeSnippet,
  pickTextPart,
  toIso,
  type TextPart,
} from './parse';
import {
  applyTrashRetention,
  connectImap,
  friendlyError,
  getAccountRow,
  orderFolders,
  type AccountRow,
  type FolderRow,
} from './store';

export const SYNC_WINDOW = 300;
const BODY_PRELOAD = 30;
/** 超过这个体积的邮件不做正文预取（分段 FETCH 容易被学校服务器断开）。 */
const BODY_PRELOAD_MAX_BYTES = 1_000_000;

export let syncStatus: MailSyncStatus = {
  phase: 'idle',
  folderPath: null,
  processed: 0,
  total: null,
  error: null,
  startedAt: null,
  finishedAt: null,
};

let syncGeneration = 0;
let activeSync: Promise<void> | null = null;

// 邮件缓存变化（读信、删除、恢复、同步完成）会改变派生的通知状态；
// notifications/index.ts 注册监听后重播通知状态，回调在数据库事务提交后触发。
const mailCacheListeners = new Set<() => void>();

export function onMailCacheChanged(listener: () => void): void {
  mailCacheListeners.add(listener);
}

export function emitMailCacheChanged(): void {
  for (const listener of mailCacheListeners) listener();
}

const FOLDER_TIMEOUT = 240_000;

/** 单个文件夹的整体时间上限：服务器卡住时也要让这一轮同步结束。 */
async function withTimeout<T>(task: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} 同步超时`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function pushSyncStatus(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('mail:sync-status', syncStatus);
  }
}

export function updateSync(patch: Partial<MailSyncStatus>): void {
  syncStatus = { ...syncStatus, ...patch };
  pushSyncStatus();
}

async function syncFolder(
  db: ReturnType<typeof getDatabase>,
  client: ImapFlow,
  folder: FolderRow,
  generation: number,
): Promise<void> {
  const isStale = () => generation !== syncGeneration;
  // 用 EXAMINE（只读）打开：同步只需要读取，Coremail 对只读打开更稳定，也不会因写模式触发锁。
  const lock = await client.getMailboxLock(folder.path, { readOnly: true });
  try {
    const mailbox = client.mailbox;
    if (!mailbox) throw new Error(`无法打开邮件文件夹 ${folder.path}`);
    const uidValidity = mailbox.uidValidity !== undefined ? String(mailbox.uidValidity) : null;
    if (folder.uid_validity && uidValidity && folder.uid_validity !== uidValidity) {
      db.prepare('DELETE FROM mail_messages WHERE folder_id = ?').run(folder.id);
    }
    // 未读数从本地表统计（排除本地已删除行），不盲信服务器计数。
    db.prepare(
      `UPDATE mail_folders SET uid_validity = ?, total = ?,
      unread = (SELECT COUNT(*) FROM mail_messages
        WHERE folder_id = mail_folders.id AND deleted_at IS NULL AND seen = 0),
      synced_at = ?
     WHERE id = ?`,
    ).run(uidValidity, mailbox.exists, new Date().toISOString(), folder.id);
    if (isStale() || mailbox.exists === 0) return;

    const start = Math.max(1, Number(mailbox.uidNext ?? 1) - SYNC_WINDOW);
    const headers = await client.fetchAll(
      { uid: `${start}:*` },
      {
        uid: true,
        flags: true,
        envelope: true,
        internalDate: true,
        size: true,
        bodyStructure: true,
      },
      { uid: true },
    );
    updateSync({ folderPath: folder.path, processed: 0, total: headers.length });
    const upsert = db.prepare(
      `INSERT INTO mail_messages
        (folder_id, uid, message_id, subject, sender_name, sender_address, to_addresses, cc_addresses,
         date, seen, flagged, has_attachments, attachments, size)
       VALUES
        (@folderId, @uid, @messageId, @subject, @senderName, @senderAddress, @toAddresses, @ccAddresses,
         @date, @seen, @flagged, @hasAttachments, @attachments, @size)
       ON CONFLICT(folder_id, uid) DO UPDATE SET
        message_id = excluded.message_id,
        subject = excluded.subject,
        sender_name = excluded.sender_name,
        sender_address = excluded.sender_address,
        to_addresses = excluded.to_addresses,
        cc_addresses = excluded.cc_addresses,
        date = excluded.date,
        seen = excluded.seen,
        flagged = excluded.flagged,
        has_attachments = excluded.has_attachments,
        attachments = excluded.attachments,
        size = excluded.size`,
    );
    const textParts: Array<TextPart | null> = [];
    let processed = 0;
    for (const message of headers) {
      if (isStale()) return;
      const envelope = message.envelope;
      const from = envelope?.from?.[0];
      const textPart = pickTextPart(message.bodyStructure);
      const attachments = collectAttachments(message.bodyStructure);
      upsert.run({
        folderId: folder.id,
        uid: message.uid,
        messageId: envelope?.messageId ?? null,
        subject: envelope?.subject ?? null,
        senderName: from?.name ?? null,
        senderAddress: from?.address ?? null,
        toAddresses: addressJson(envelope?.to as MailAddress[] | undefined),
        ccAddresses: addressJson(envelope?.cc as MailAddress[] | undefined),
        date: toIso(message.internalDate ?? envelope?.date),
        seen: message.flags?.has('\\Seen') ? 1 : 0,
        flagged: message.flags?.has('\\Flagged') ? 1 : 0,
        hasAttachments: attachments.length > 0 ? 1 : 0,
        attachments: attachments.length > 0 ? JSON.stringify(attachments) : null,
        size: message.size ?? null,
      });
      textParts.push(textPart);
      processed += 1;
      if (processed % 25 === 0) updateSync({ processed });
    }
    db.prepare('DELETE FROM mail_messages WHERE folder_id = ? AND uid < ?').run(folder.id, start);
    db.prepare(
      `UPDATE mail_folders SET unread =
        (SELECT COUNT(*) FROM mail_messages
         WHERE folder_id = mail_folders.id AND deleted_at IS NULL AND seen = 0)
       WHERE id = ?`,
    ).run(folder.id);

    // 从最新一封开始预取正文，保证打开页面即可阅读。
    const updateBody = db.prepare(
      `UPDATE mail_messages
       SET body_text = ?, body_html = ?, body_version = 1, snippet = COALESCE(?, snippet)
       WHERE folder_id = ? AND uid = ?`,
    );
    for (
      let index = headers.length - 1;
      index >= Math.max(0, headers.length - BODY_PRELOAD);
      index -= 1
    ) {
      if (isStale()) return;
      // 连接被服务器断开时继续发请求只会得到 Connection not available；交给外层重连。
      if (!client.usable) break;
      const uid = headers[index]?.uid;
      const textPart = textParts[index];
      if (uid === undefined || !textPart) continue;
      // 超大邮件不做预取：分段 FETCH 更容易被学校服务器断开，打开时再按需下载。
      if ((headers[index]?.size ?? 0) > BODY_PRELOAD_MAX_BYTES) continue;
      try {
        const body = await downloadMessageBody(
          client,
          uid,
          textPart,
          headers[index]?.bodyStructure,
        );
        updateBody.run(body.text, body.html, makeSnippet(body.text), folder.id, uid);
      } catch {
        // 单封正文获取失败不阻塞同步；打开邮件时会再次尝试。
      }
    }
    updateSync({ processed });
  } finally {
    lock.release();
  }
}

async function runSync(account: AccountRow, password: string): Promise<void> {
  const trace =
    process.env.JLU_MAIL_DEBUG === '1'
      ? (...args: unknown[]) => console.log('[mail-sync]', ...args)
      : () => {};
  const generation = syncGeneration;
  const db = getDatabase();
  const isStale = () => generation !== syncGeneration;
  let client = connectImap(account.address, password);
  const ensureClient = async () => {
    if (client.usable) return;
    trace('reconnecting after closed connection');
    client = connectImap(account.address, password);
    await client.connect();
  };
  trace('connect start', account.address);
  updateSync({
    phase: 'connecting',
    folderPath: null,
    processed: 0,
    total: null,
    error: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  });
  try {
    await client.connect();
    trace('connected');
    updateSync({ phase: 'syncing' });
    const listed = await client.list();
    trace(
      'listed',
      listed.map((folder) => `${folder.path}[${folder.specialUse ?? ''}]`).join(' | '),
    );
    // 草稿箱与已删除改为本地功能，服务器 \Drafts / \Trash 不再同步。
    const folders = orderFolders(
      listed.filter(
        (folder) =>
          !folder.flags.has('\\Noselect') &&
          folder.specialUse !== '\\Drafts' &&
          folder.specialUse !== '\\Trash',
      ),
    );
    const upsertFolder = db.prepare(
      `INSERT INTO mail_folders (account_id, path, name, special_use)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(account_id, path) DO UPDATE SET
        name = excluded.name,
        special_use = excluded.special_use`,
    );
    const keptPaths = new Set<string>();
    const folderRows: FolderRow[] = [];
    for (const folder of folders) {
      upsertFolder.run(account.id, folder.path, folder.name, folder.specialUse ?? null);
      keptPaths.add(folder.path);
      const row = db
        .prepare(
          'SELECT id, path, name, special_use, uid_validity FROM mail_folders WHERE account_id = ? AND path = ?',
        )
        .get(account.id, folder.path) as FolderRow | undefined;
      if (row) folderRows.push(row);
    }
    // 过滤后 keptPaths 可能为空（服务器只有草稿箱/已删除时），NOT IN () 不是合法 SQL。
    if (keptPaths.size > 0) {
      const placeholders = [...keptPaths].map(() => '?').join(', ');
      db.prepare(
        `DELETE FROM mail_folders WHERE account_id = ? AND path NOT IN (${placeholders})`,
      ).run(account.id, ...keptPaths);
    } else {
      db.prepare('DELETE FROM mail_folders WHERE account_id = ?').run(account.id);
    }

    const failures: string[] = [];
    for (const folderRow of folderRows) {
      if (isStale()) return;
      trace('folder start', folderRow.name);
      try {
        // 上一个文件夹的预取可能被服务器断开连接，进入下一个文件夹前先恢复。
        await ensureClient();
        await withTimeout(
          syncFolder(db, client, folderRow, generation),
          FOLDER_TIMEOUT,
          folderRow.name,
        );
        trace('folder done', folderRow.name);
      } catch (error) {
        trace('folder failed', folderRow.name, String(error));
        // 单个文件夹失败（服务器不支持、权限不足、卡住超时）不影响其余文件夹。
        failures.push(`${folderRow.name}：${friendlyError(error)}`);
      }
    }
    if (isStale()) return;
    applyTrashRetention(db);
    db.prepare('UPDATE mail_accounts SET last_synced_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      account.id,
    );
    updateSync({
      phase: failures.length > 0 ? 'error' : 'idle',
      folderPath: null,
      processed: 0,
      total: null,
      error: failures.length > 0 ? `部分文件夹同步失败（${failures.join('；')}）` : null,
      finishedAt: new Date().toISOString(),
    });
  } catch (error) {
    trace('sync failed', String(error));
    updateSync({
      phase: 'error',
      folderPath: null,
      error: friendlyError(error),
      finishedAt: new Date().toISOString(),
    });
  } finally {
    try {
      client.close();
    } catch {
      // 连接已被服务器断开时 close 会抛错，忽略即可。
    }
    // 同步会改写 seen 标志（含他端已读），通知面板的派生已读需随之刷新。
    emitMailCacheChanged();
  }
}

export async function configureMailAccount(input: MailConfigureInput): Promise<MailResult> {
  const address = input.address.trim().toLowerCase();
  const password = input.password;
  if (!z.email().safeParse(address).success || password.length === 0) {
    return { ok: false, error: '请输入完整的邮箱地址和密码' };
  }
  const server = input.server ?? JLU_MAIL_SERVER;
  if (!input.server && !address.endsWith('@mails.jlu.edu.cn')) {
    return {
      ok: false,
      error: '学生邮箱预设仅支持 @mails.jlu.edu.cn；教工邮箱或其他邮箱请改选第三方 IMAP',
    };
  }
  const db = getDatabase();
  const client = connectImap(address, password, server);
  try {
    await client.connect();
  } catch (error) {
    client.close();
    return { ok: false, error: friendlyError(error) };
  }
  client.close();
  const existing = getAccountRow();
  if (existing && existing.address !== address) {
    syncGeneration += 1;
    db.prepare('DELETE FROM mail_accounts').run();
    clearMailCredentials();
  }
  if (existing && existing.address === address) {
    db.prepare(
      'UPDATE mail_accounts SET imap_host = ?, imap_port = ?, smtp_host = ?, smtp_port = ? WHERE id = ?',
    ).run(server.imapHost, server.imapPort, server.smtpHost, server.smtpPort, existing.id);
  } else {
    db.prepare(
      'INSERT INTO mail_accounts (address, imap_host, imap_port, smtp_host, smtp_port, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(
      address,
      server.imapHost,
      server.imapPort,
      server.smtpHost,
      server.smtpPort,
      new Date().toISOString(),
    );
  }
  try {
    saveMailCredentials({ address, password });
  } catch (error) {
    return { ok: false, error: friendlyError(error) };
  }
  return { ok: true };
}

export function disconnectMailAccount(): MailResult {
  syncGeneration += 1;
  const db = getDatabase();
  db.prepare('DELETE FROM mail_accounts').run();
  try {
    clearMailCredentials();
  } catch {
    // 凭据文件已不存在时忽略。
  }
  updateSync({
    phase: 'idle',
    folderPath: null,
    processed: 0,
    total: null,
    error: null,
    startedAt: null,
    finishedAt: null,
  });
  return { ok: true };
}

export function startMailSync(): void {
  if (activeSync) return;
  const account = getAccountRow();
  if (!account) throw new Error('未配置邮箱账号');
  let credential;
  try {
    credential = loadMailCredentials();
    if (!credential) throw new Error('未找到邮箱凭据，请在设置中重新登录邮箱');
  } catch (cause) {
    updateSync({
      phase: 'error',
      error: friendlyError(cause),
      finishedAt: new Date().toISOString(),
    });
    return;
  }
  syncGeneration += 1;
  activeSync = runSync(account, credential.password).finally(() => {
    activeSync = null;
  });
}
