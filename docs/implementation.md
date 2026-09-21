# リカバリメールシステム 実装仕様書 v1

> 現行実装では、Web 層を React Router v7 Framework Mode（Cloudflare Vite plugin）へ移行済みです。旧来の Hono ルートと `src/` は廃止され、HTTP UI・認証・メール操作は `app/routes/` の loaders / actions、Worker entrypoint は `app/index.ts` にあります。メール受信、KV、認証、送信などのドメインサービスは `app/lib/` に分離して配置しています。以下の `src/`・`/api/*`・Hono の具体例は初期実装案の履歴であり、運用手順としては使用しません。

## 1. ディレクトリ構成

```text
cf-simple-mail/
├── src/
│   ├── index.ts
│   │
│   ├── config/
│   │   └── constants.ts
│   │
│   ├── types/
│   │   ├── env.ts
│   │   ├── mail.ts
│   │   ├── draft.ts
│   │   └── api.ts
│   │
│   ├── storage/
│   │   └── mail-store.ts
│   │
│   ├── mail/
│   │   ├── receiver.ts
│   │   ├── mime.ts
│   │   ├── sender.ts
│   │   ├── resend-sender.ts
│   │   └── cloudflare-sender.ts
│   │
│   ├── auth/
│   │   ├── password.ts
│   │   ├── session.ts
│   │   └── middleware.ts
│   │
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── mails.ts
│   │   └── send.ts
│   │
│   └── frontend/
│       ├── index.html
│       ├── app.ts
│       ├── api.ts
│       ├── draft-store.ts
│       ├── mail-viewer.ts
│       └── style.css
│
├── test/
│   ├── mail-store.test.ts
│   ├── auth.test.ts
│   └── send.test.ts
│
├── wrangler.jsonc
├── package.json
└── tsconfig.json
```

---

## 2. 環境定義

### `src/types/env.ts`

```ts
export interface Env {
  MAIL_KV: KVNamespace;

  MAIL_PROVIDER: "resend" | "cloudflare";

  MAIL_FROM: string;
  MAIL_TTL_SECONDS: string;
  SESSION_TTL_SECONDS: string;

  AUTH_PASSWORD_VERIFIER: string;
  SESSION_SECRET: string;

  RESEND_API_KEY?: string;

  // Cloudflare Email Service移行後
  EMAIL?: SendEmail;
}
```

---

## 3. 共通定数

### `src/config/constants.ts`

```ts
export const MAIL_TTL_SECONDS = 60 * 60 * 24 * 7;

export const SESSION_TTL_SECONDS = 60 * 30;

export const MAX_MAIL_SIZE =
  20 * 1024 * 1024;

export const MAIL_PREFIX = {
  inbox: "mail:inbox:",
  sent: "mail:sent:",
} as const;
```

TTLは環境変数で上書き可能としてもよい。

---

## 4. メール型

### `src/types/mail.ts`

```ts
export type MailType =
  | "inbox"
  | "sent";

export interface MailMetadata {
  direction: MailType;

  from: string;
  to: string;

  subject: string;

  timestamp: string;

  retained: boolean;

  expiresAt: string | null;

  messageId?: string;
}

export interface MailListItem
  extends MailMetadata {
  id: string;
}

export interface MailMessage {
  from: string;

  to: string[];

  subject: string;

  text?: string;
  html?: string;
}

export interface SendResult {
  id: string;

  provider:
    | "resend"
    | "cloudflare";
}
```

---

# 5. KVデータ形式

キー：

```text
mail:inbox:<ULID>

mail:sent:<ULID>
```

Value：

```text
Raw MIME
```

Metadata：

```json
{
  "direction": "inbox",
  "from": "service@example.com",
  "to": "recovery@example.com",
  "subject": "Password Reset",
  "timestamp": "2026-09-20T10:00:00.000Z",
  "retained": false,
  "expiresAt": "2026-09-27T10:00:00.000Z"
}
```

---

# 6. MailStore

Cloudflare KVを直接Routeから操作しない。

### `src/storage/mail-store.ts`

```ts
import type {
  MailMetadata,
  MailListItem,
  MailType,
} from "../types/mail";

export class MailStore {
  constructor(
    private readonly kv: KVNamespace
  ) {}

  private key(
    type: MailType,
    id: string
  ) {
    return `mail:${type}:${id}`;
  }

  async save(
    type: MailType,
    id: string,
    rawMime: ArrayBuffer,
    metadata: MailMetadata,
    ttl: number
  ) {
    await this.kv.put(
      this.key(type, id),
      rawMime,
      {
        expirationTtl: ttl,
        metadata,
      }
    );
  }

  async get(
    type: MailType,
    id: string
  ) {
    return this.kv.getWithMetadata<
      ArrayBuffer,
      MailMetadata
    >(
      this.key(type, id),
      "arrayBuffer"
    );
  }

  async delete(
    type: MailType,
    id: string
  ) {
    await this.kv.delete(
      this.key(type, id)
    );
  }
}
```

---

# 7. 一覧取得

同じ`MailStore`へ実装する。

```ts
async list(
  type: MailType
): Promise<MailListItem[]> {
  const prefix = `mail:${type}:`;

  let cursor: string | undefined;
  const result: MailListItem[] = [];

  do {
    const page =
      await this.kv.list<MailMetadata>({
        prefix,
        cursor,
      });

    for (const key of page.keys) {
      if (!key.metadata) {
        continue;
      }

      result.push({
        id: key.name.slice(
          prefix.length
        ),
        ...key.metadata,
      });
    }

    cursor =
      page.list_complete
        ? undefined
        : page.cursor;
  } while (cursor);

  return result.sort(
    (a, b) =>
      Date.parse(b.timestamp) -
      Date.parse(a.timestamp)
  );
}
```

Raw MIMEは一覧取得時には読み込まない。

---

# 8. 保持処理

### 保持

```ts
async retain(
  type: MailType,
  id: string
) {
  const existing =
    await this.get(type, id);

  if (
    !existing.value ||
    !existing.metadata
  ) {
    throw new Error(
      "MAIL_NOT_FOUND"
    );
  }

  await this.kv.put(
    this.key(type, id),
    existing.value,
    {
      metadata: {
        ...existing.metadata,
        retained: true,
        expiresAt: null,
      },
    }
  );
}
```

TTLを指定しないため期限なしとなる。

### 保持解除

```ts
async release(
  type: MailType,
  id: string,
  ttl: number
) {
  const existing =
    await this.get(type, id);

  if (
    !existing.value ||
    !existing.metadata
  ) {
    throw new Error(
      "MAIL_NOT_FOUND"
    );
  }

  const expiresAt =
    new Date(
      Date.now() + ttl * 1000
    ).toISOString();

  await this.kv.put(
    this.key(type, id),
    existing.value,
    {
      expirationTtl: ttl,

      metadata: {
        ...existing.metadata,

        retained: false,
        expiresAt,
      },
    }
  );
}
```

保持解除時点から新しく7日間保存する。

---

# 9. Email Worker

### `src/mail/receiver.ts`

```ts
import PostalMime
  from "postal-mime";

import { ulid }
  from "ulid";

import {
  MAIL_TTL_SECONDS,
  MAX_MAIL_SIZE,
} from "../config/constants";

import {
  MailStore,
} from "../storage/mail-store";

export async function receiveMail(
  message: ForwardableEmailMessage,
  env: Env
) {
  if (
    message.rawSize >
    MAX_MAIL_SIZE
  ) {
    message.setReject(
      "Message too large"
    );
    return;
  }

  const raw =
    await new Response(
      message.raw
    ).arrayBuffer();

  const parsed =
    await PostalMime.parse(raw);

  const id = ulid();

  const now =
    new Date();

  const expires =
    new Date(
      now.getTime() +
      MAIL_TTL_SECONDS * 1000
    );

  const store =
    new MailStore(env.MAIL_KV);

  await store.save(
    "inbox",
    id,
    raw,
    {
      direction: "inbox",

      from:
        parsed.from?.address ??
        message.from,

      to: message.to,

      subject:
        parsed.subject ?? "",

      timestamp:
        now.toISOString(),

      retained: false,

      expiresAt:
        expires.toISOString(),

      messageId:
        message.headers.get(
          "message-id"
        ) ?? undefined,
    },
    MAIL_TTL_SECONDS
  );
}
```

---

# 10. Workerエントリポイント

### `src/index.ts`

```ts
import { Hono }
  from "hono";

import { receiveMail }
  from "./mail/receiver";

import type { Env }
  from "./types/env";

const app =
  new Hono<{
    Bindings: Env;
  }>();

// routes
// app.route(...)

export default {
  fetch:
    app.fetch,

  async email(
    message:
      ForwardableEmailMessage,

    env: Env,

    ctx:
      ExecutionContext
  ) {
    await receiveMail(
      message,
      env
    );
  },
} satisfies ExportedHandler<Env>;
```

CloudflareのEmail Workerでは`message.raw`からRaw MIMEを直接取得できる。

---

# 11. MailSender

### `src/mail/sender.ts`

```ts
import type {
  MailMessage,
  SendResult,
} from "../types/mail";

export interface MailSender {
  send(
    message: MailMessage
  ): Promise<SendResult>;
}
```

Factory：

```ts
export function createMailSender(
  env: Env
): MailSender {
  switch (env.MAIL_PROVIDER) {
    case "resend":
      if (!env.RESEND_API_KEY) {
        throw new Error(
          "RESEND_API_KEY missing"
        );
      }

      return new ResendMailSender(
        env.RESEND_API_KEY
      );

    case "cloudflare":
      if (!env.EMAIL) {
        throw new Error(
          "EMAIL binding missing"
        );
      }

      return new CloudflareMailSender(
        env.EMAIL
      );
  }
}
```

---

# 12. ResendMailSender

### `src/mail/resend-sender.ts`

```ts
import { Resend }
  from "resend";

export class ResendMailSender
  implements MailSender {

  constructor(
    private readonly apiKey:
      string
  ) {}

  async send(
    message: MailMessage
  ): Promise<SendResult> {
    const resend =
      new Resend(this.apiKey);

    const result =
      await resend.emails.send({
        from: message.from,

        to: message.to,

        subject:
          message.subject,

        text: message.text,

        html: message.html,
      });

    if (result.error) {
      throw new Error(
        "MAIL_SEND_FAILED"
      );
    }

    return {
      id: result.data!.id,
      provider: "resend",
    };
  }
}
```

ResendはCloudflare Workersから直接利用できる。

---

# 13. CloudflareMailSender

将来用。

### `src/mail/cloudflare-sender.ts`

```ts
export class CloudflareMailSender
  implements MailSender {

  constructor(
    private readonly email:
      SendEmail
  ) {}

  async send(
    message: MailMessage
  ): Promise<SendResult> {
    const result =
      await this.email.send({
        from: message.from,

        to: message.to,

        subject:
          message.subject,

        text: message.text,

        html: message.html,
      });

    return {
      id: result.id,
      provider: "cloudflare",
    };
  }
}
```

Cloudflare Email Serviceは`send_email` binding経由の`send()`を提供している。送信元アドレスもBinding側で制限可能。

---

# 14. 送信API

### `src/routes/send.ts`

```ts
app.post(
  "/api/send",
  authMiddleware,
  async (c) => {
    const body =
      await c.req.json();

    const message: MailMessage = {
      from:
        c.env.MAIL_FROM,

      to:
        body.to,

      subject:
        body.subject,

      text:
        body.text,

      html:
        body.html,
    };

    validateMail(message);

    const sender =
      createMailSender(c.env);

    const result =
      await sender.send(
        message
      );

    const mime =
      buildMime(message);

    const id = ulid();

    const store =
      new MailStore(
        c.env.MAIL_KV
      );

    const now =
      new Date();

    const ttl =
      Number(
        c.env
          .MAIL_TTL_SECONDS
      );

    await store.save(
      "sent",
      id,
      mime,
      {
        direction: "sent",

        from:
          message.from,

        to:
          message.to.join(", "),

        subject:
          message.subject,

        timestamp:
          now.toISOString(),

        retained: false,

        expiresAt:
          new Date(
            now.getTime() +
            ttl * 1000
          ).toISOString(),

        messageId:
          result.id,
      },
      ttl
    );

    return c.json({
      id,
    });
  }
);
```

順序は必ず、

```text
送信成功
↓
Sent保存
```

とする。

---

# 15. メール一覧API

```text
GET /api/mails?type=inbox
GET /api/mails?type=sent
```

レスポンス：

```json
{
  "items": [
    {
      "id": "01K...",
      "direction": "inbox",
      "from": "service@example.com",
      "to": "recovery@example.com",
      "subject": "Password Reset",
      "timestamp": "...",
      "retained": false,
      "expiresAt": "..."
    }
  ]
}
```

---

# 16. メール詳細API

```text
GET /api/mails/:type/:id
```

Raw MIMEを返す。

Response：

```text
Content-Type: message/rfc822
```

Browser側でpostal-mimeによって解析する。

---

# 17. 保持API

```text
POST
/api/mails/:type/:id/retain
```

→ `MailStore.retain()`

```text
DELETE
/api/mails/:type/:id/retain
```

→ `MailStore.release()`

---

# 18. 削除API

```text
DELETE
/api/mails/:type/:id
```

IDはULID形式のみ許可する。

クライアントからKVキーそのものを渡させない。

---

# 19. Draft型

### `src/types/draft.ts`

```ts
export type DraftStatus =
  | "draft"
  | "failed";

export interface DraftMail {
  id: string;

  to: string[];

  subject: string;

  text: string;

  html?: string;

  status:
    DraftStatus;

  createdAt: string;

  updatedAt: string;

  lastError?: string;
}
```

---

# 20. DraftStore

### `src/frontend/draft-store.ts`

```ts
import type {
  DraftMail,
} from "../types/draft";

export interface DraftStore {
  list():
    Promise<DraftMail[]>;

  get(
    id: string
  ):
    Promise<DraftMail | null>;

  save(
    draft: DraftMail
  ):
    Promise<void>;

  delete(
    id: string
  ):
    Promise<void>;
}
```

---

# 21. LocalStorageDraftStore

```ts
const STORAGE_KEY =
  "cf-simple-mail:drafts:v1";

export class
LocalStorageDraftStore
implements DraftStore {

  async list() {
    const value =
      localStorage.getItem(
        STORAGE_KEY
      );

    if (!value) {
      return [];
    }

    return JSON.parse(value);
  }

  async get(
    id: string
  ) {
    const drafts =
      await this.list();

    return (
      drafts.find(
        draft =>
          draft.id === id
      ) ?? null
    );
  }

  async save(
    draft: DraftMail
  ) {
    const drafts =
      await this.list();

    const index =
      drafts.findIndex(
        item =>
          item.id === draft.id
      );

    if (index >= 0) {
      drafts[index] = draft;
    } else {
      drafts.push(draft);
    }

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(drafts)
    );
  }

  async delete(
    id: string
  ) {
    const drafts =
      await this.list();

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        drafts.filter(
          draft =>
            draft.id !== id
        )
      )
    );
  }
}
```

---

# 22. Compose自動保存

新規Compose開始時：

```ts
const draft: DraftMail = {
  id: ulid(),

  to: [],

  subject: "",

  text: "",

  status: "draft",

  createdAt:
    new Date().toISOString(),

  updatedAt:
    new Date().toISOString(),
};
```

入力変更：

```text
input
 ↓
750ms debounce
 ↓
DraftStore.save()
```

画面：

```text
Draft saved just now
```

---

# 23. 送信成功

```ts
try {
  await api.send(draft);

  await draftStore.delete(
    draft.id
  );

  navigate("/sent");
}
```

---

# 24. 送信失敗

```ts
catch {
  await draftStore.save({
    ...draft,

    status: "failed",

    updatedAt:
      new Date()
        .toISOString(),

    lastError:
      "mail_send_failed",
  });
}
```

メール本文は失われない。

---

# 25. Failed再送

```text
Drafts
 ↓
⚠ Send failed
 ↓
Retry
 ↓
POST /api/send
```

成功：

```text
Sentへ保存
+
localStorage削除
```

失敗：

```text
failed状態維持
```

---

# 26. 下書きと添付

初期実装：

```text
DraftStore

To
Subject
Text
HTML
```

のみ保存。

File/BlobはlocalStorageへ保存しない。

添付を選択した状態で画面を離れる場合には、

```text
Attachments are not saved
with this draft.
```

などの警告を表示する。

将来的には、

```text
DraftStore
 ↓
IndexedDB
```

へ切り替える。

---

# 27. 認証セッション

第二認証成功後にHMAC署名済みトークンを生成。

Cookie：

```text
__Host-recovery_session
```

属性：

```text
HttpOnly
Secure
SameSite=Strict
Path=/
Max-Age=1800
```

サーバー側Session DBは使用しない。

---

# 28. API認証Middleware

以下を保護：

```text
/api/mails/*
/api/send
/api/logout
```

`/api/auth`のみ第二認証前でも利用可能。

ただしWorker全体はCloudflare Access配下とする。

---

# 29. フロントエンド状態

メインUI：

```text
┌──────────────────────────────────────────┐
│ Recovery Mail                    [Lock]  │
├────────────┬─────────────────────────────┤
│ Inbox      │                             │
│ Sent       │     Mail / Compose          │
│ Drafts     │                             │
│            │                             │
│ + Compose  │                             │
└────────────┴─────────────────────────────┘
```

Inbox：

```text
☆ GitHub
  Password Reset
  3 min ago
  Expires in 6d 23h

★ Example
  Recovery Code
  Yesterday
  Kept
```

Drafts：

```text
✎ support@example.com
  Account Recovery
  Updated 2 min ago

⚠ example@example.com
  Recovery Request
  Send failed
```

---

# 30. メール閲覧

Browser：

```text
Raw MIME
 ↓
postal-mime
 ↓
Text / HTML / Attachments
```

HTML：

```text
postal-mime
 ↓
DOMPurify
 ↓
render
```

外部画像は自動ロードしない。

---

# 31. セキュリティ境界

```text
Cloudflare KV

受信成功メール
送信成功メール
Raw MIME
Metadata


Browser localStorage

Draft
Failed


Workers Secrets

Password verifier
Session secret
Resend API key
```

Cloudflare KVにはDraftを保存しない。

localStorageには認証情報を保存しない。

---

# 32. `wrangler.jsonc`

現在：

```jsonc
{
  "name": "cf-simple-mail",

  "main": "src/index.ts",

  "compatibility_date":
    "2026-09-20",

  "workers_dev": false,

  "kv_namespaces": [
    {
      "binding": "MAIL_KV",
      "id": "<namespace-id>"
    }
  ],

  "vars": {
    "MAIL_PROVIDER":
      "resend",

    "MAIL_FROM":
      "recovery@example.com",

    "MAIL_TTL_SECONDS":
      "604800",

    "SESSION_TTL_SECONDS":
      "1800"
  }
}
```

Secrets：

```text
AUTH_PASSWORD_VERIFIER
SESSION_SECRET
RESEND_API_KEY
```

---

# 33. Cloudflare Email Service移行後

追加：

```jsonc
{
  "send_email": [
    {
      "name": "EMAIL",

      "allowed_sender_addresses": [
        "recovery@example.com"
      ]
    }
  ]
}
```

そして、

```text
MAIL_PROVIDER=cloudflare
```

へ変更する。

送信元制限はCloudflare Binding側でも設定する。

---

# 34. 初期実装順序

```text
1. Worker + Hono
       ↓
2. KV MailStore
       ↓
3. Email Worker
       ↓
4. Inbox list/detail
       ↓
5. Keep / Release
       ↓
6. Delete
       ↓
7. Access
       ↓
8. 第二認証
       ↓
9. DraftStore
       ↓
10. Compose
       ↓
11. Resend
       ↓
12. Sent
       ↓
13. Failed / Retry
       ↓
14. MIME HTML Viewer
       ↓
15. 添付閲覧
       ↓
16. セキュリティ調整
```

---

# 35. 最終責務分離

```text
Email Routing
└─ 受信

Email Worker
└─ Raw MIME保存

Cloudflare KV
├─ Inbox
├─ Sent
├─ TTL
└─ Keep

Cloudflare Access
└─ 第一認証

Hono Worker
├─ 第二認証
├─ Mail API
├─ Keep
├─ Delete
└─ Send

MailSender
├─ Resend
└─ Cloudflare Email Service

Browser
├─ UI
├─ MIME表示
└─ DraftStore

localStorage
├─ Draft
└─ Failed
```
