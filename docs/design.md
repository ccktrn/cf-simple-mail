# リカバリメールシステム 設計仕様書

> この文書の `/api/*`・Hono に関する記述は初期設計の履歴です。現行実装は React Router v7 の routes / loaders / actions を使用し、HTTP API を外部公開しません。実装上の正は `app/routes.ts`、`app/routes/`、`app/lib/` および README とします。

## 1. 概要

外部サービスのアカウント復旧・本人確認メールを、独自ドメインで安全に受信・閲覧・送信するための簡易メールシステム。

### 基本方針

- Cloudflare中心のサーバーレス構成
- メール本体はRaw MIMEのままCloudflare KVへ保存
- データベースは使用しない
- 通常メールは7日後に自動削除
- 必要なメールは「保持」に切り替えて自動削除から除外可能
- 保持解除後は、その時点から新たに7日間保存
- 下書き・送信失敗メールはブラウザ側にのみ保存
- 認証はCloudflare Access + Worker独自認証
- 送信は当面Resendを利用
- 将来的にCloudflare Email Serviceへ移行する

---

## 2. システム構成

```text
受信

Internet
   ↓
Cloudflare Email Routing
   ↓
Email Worker
   ↓
Cloudflare KV


閲覧

Browser
   ↓
Cloudflare Access
   ↓
Worker独自認証
   ↓
Hono Worker
   ↓
Cloudflare KV


送信

Browser
   ↓
Cloudflare Access
   ↓
Worker独自認証
   ↓
Hono Worker
   ↓
MailSender
   ↓
Resend（現在）
Cloudflare Email Service（将来）


下書き

Browser
   ↓
DraftStore
   ↓
localStorage
```

---

## 3. 使用技術

- Cloudflare DNS
- Cloudflare Email Routing
- Cloudflare Workers
- Cloudflare KV
- Cloudflare Access
- Hono
- TypeScript
- postal-mime
- DOMPurify
- localStorage
- Resend
- Cloudflare Email Service（将来）

---

## 4. 認証

Web UIおよびAPIは二段階認証で保護する。

### 第一認証

Cloudflare Accessを使用する。

- Passkey / FIDO2等を利用
- 未認証ユーザーはWeb UI/APIへアクセス不可

### 第二認証

Worker側で独自パスワード認証を行う。

- パスワード検証情報はWorkers Secretsに保存
- 平文パスワードは保存しない
- 認証成功後に短寿命セッションを発行

Cookie：

```text
HttpOnly
Secure
SameSite=Strict
```

セッション有効期限は30分程度とする。

---

## 5. Cloudflare KV

KVには実際に成立したメールのみ保存する。

対象：

```text
Inbox
Sent
```

キー：

```text
mail:inbox:<ULID>
mail:sent:<ULID>
```

### Value

Raw MIMEをそのまま保存する。

```text
Headers
Multipart Body
Text
HTML
Attachments
```

添付ファイルもMIMEの一部として同じValue内に保持する。

---

## 6. KV Metadata

一覧表示用の情報だけMetadataへ保存する。

```json
{
  "direction": "inbox",
  "from": "service@example.com",
  "to": "recovery@example.com",
  "subject": "Password Reset",
  "timestamp": "2026-09-20T08:00:00Z",
  "retained": false,
  "expiresAt": "2026-09-27T08:00:00Z"
}
```

保持中：

```json
{
  "direction": "inbox",
  "from": "service@example.com",
  "to": "recovery@example.com",
  "subject": "Password Reset",
  "timestamp": "2026-09-20T08:00:00Z",
  "retained": true,
  "expiresAt": null
}
```

---

## 7. 通常メールの保存期間

受信・送信メールは原則7日間保存する。

```text
expirationTtl = 604800
```

```text
メール保存
   ↓
Cloudflare KV
├─ Raw MIME
├─ Metadata
├─ retained = false
└─ TTL = 7日
```

TTL経過後はCloudflare KV側で自動削除する。

---

## 8. 保持機能

必要なメールは自動削除対象から除外できる。

UI表示：

```text
☆ 通常
★ 保持中
```

### 保持

```text
通常メール
   ↓
Keep
   ↓
同一KVキーを再保存
   ↓
TTLなし
retained = true
expiresAt = null
```

Inbox / Sentの両方で利用可能とする。

---

## 9. 保持解除

保持解除したメールには、その時点から新しく7日間のTTLを設定する。

```text
保持メール
   ↓
Release
   ↓
expirationTtl = 604800
   ↓
retained = false
expiresAt = 現在 + 7日
```

元の受信日時・送信日時は削除期限の計算に使用しない。

これにより保持解除直後の誤削除を防ぐ。

---

## 10. メール一覧

DBは使用せず、KVのキー一覧取得を利用する。

Inbox：

```text
KV.list(prefix="mail:inbox:")
```

Sent：

```text
KV.list(prefix="mail:sent:")
```

表示項目：

- From / To
- Subject
- 受信 / 送信日時
- 保持状態
- 自動削除までの残り時間

例：

```text
Inbox

☆ GitHub
  Password reset
  Expires in 6d 23h

★ Discord
  Recovery Code
  Kept

☆ Example
  Account Recovery
  Expires in 2d 04h
```

一覧取得時にはRaw MIMEを読み込まない。

---

## 11. メール閲覧

```text
GET /api/mails/:type/:id
        ↓
Cloudflare KV
        ↓
Raw MIME
        ↓
postal-mime
        ↓
本文 / HTML / 添付
```

HTMLメールは安全に表示する。

- DOMPurify等でサニタイズ
- `script`禁止
- `iframe`禁止
- 外部画像の自動ロード禁止
- 外部リンクはユーザー操作時のみ開く

---

## 12. 添付ファイル

添付ファイル専用ストレージは使用しない。

```text
Cloudflare KV
   ↓
Raw MIME
   ├─ Text
   ├─ HTML
   └─ Attachments
```

閲覧時にpostal-mimeで解析する。

Raw MIME全体にアプリケーション側のサイズ上限を設ける。

初期値：

```text
20 MiB
```

Cloudflare KVの上限に余裕を持たせる。

---

## 13. メール受信

```text
Email Routing
      ↓
Email Worker
      ↓
Raw MIME取得
      ↓
サイズ確認
      ↓
ヘッダ解析
      ↓
ULID生成
      ↓
KV保存
```

保存：

```text
Key
mail:inbox:<ULID>

Value
Raw MIME

Metadata
from
to
subject
timestamp
retained=false
expiresAt

TTL
604800秒
```

---

## 14. メール送信

```text
Browser
   ↓
POST /api/send
   ↓
MailSender
   ↓
Resend
   ↓
送信成功
   ↓
保存用Raw MIME生成
   ↓
Cloudflare KV
```

送信成功した場合のみ、

```text
mail:sent:<ULID>
```

へ保存する。

送信済みメールも通常は7日後に削除する。

---

## 15. MailSender

メール送信処理はプロバイダから分離する。

```ts
interface MailSender {
  send(message: MailMessage): Promise<SendResult>;
}
```

実装：

```text
MailSender
├── ResendMailSender
└── CloudflareMailSender
```

現在：

```text
MAIL_PROVIDER=resend
```

将来：

```text
MAIL_PROVIDER=cloudflare
```

Web UIやAPIは送信プロバイダを意識しない。

---

## 16. 下書き機能

作成途中のメールはCloudflare KVへ保存せず、ブラウザ側へ保存する。

保存対象：

- 新規作成途中のメール
- 明示的に保存した下書き
- 送信失敗したメール

```text
Compose
   ↓
DraftStore
   ↓
localStorage
```

---

## 17. Draftデータ

```ts
type DraftMail = {
  id: string;

  to: string[];
  subject: string;
  text: string;
  html?: string;

  status: "draft" | "failed";

  createdAt: string;
  updatedAt: string;

  lastError?: string;
};
```

例：

```json
{
  "id": "01K...",
  "to": ["support@example.com"],
  "subject": "Account recovery",
  "text": "Hello...",
  "status": "draft",
  "createdAt": "2026-09-20T08:00:00Z",
  "updatedAt": "2026-09-20T08:15:00Z"
}
```

---

## 18. DraftStore

下書き保存処理は抽象化する。

```ts
interface DraftStore {
  list(): Promise<DraftMail[]>;
  get(id: string): Promise<DraftMail | null>;
  save(draft: DraftMail): Promise<void>;
  delete(id: string): Promise<void>;
}
```

初期実装：

```text
LocalStorageDraftStore
```

将来的に添付ファイル付き下書きを保存する必要が出た場合：

```text
IndexedDbDraftStore
```

へ差し替え可能とする。

---

## 19. 自動下書き保存

Compose画面では自動保存する。

```text
ユーザー入力
   ↓
500〜1000ms debounce
   ↓
localStorage更新
```

保存対象：

- To
- Subject
- Text
- HTML

画面遷移やブラウザ再読み込み後も復元可能とする。

---

## 20. 送信成功時

```text
Draft
   ↓
POST /api/send
   ↓
送信成功
   ↓
SentをKVへ保存
   ↓
対応するDraftを削除
```

結果：

```text
Sent
→ Cloudflare KV

Draft
→ Browserから削除
```

---

## 21. 送信失敗時

ネットワーク障害・Resend障害・APIエラー等で送信に失敗した場合、Draftを削除しない。

```text
送信失敗
   ↓
status = failed
   ↓
localStorageへ保存
```

必要に応じて：

```text
lastError
```

に簡易エラー情報を保存する。

メール本文や認証情報はエラーログへ送信しない。

---

## 22. 送信失敗メールの再送

送信失敗メールには以下の操作を提供する。

```text
Retry
Edit
Delete
```

再送成功：

```text
Failed
   ↓
Retry
   ↓
送信成功
   ↓
Sentへ保存
   ↓
localStorageから削除
```

---

## 23. 下書き添付ファイル

初期実装では添付ファイル自体はlocalStorageへ保存しない。

理由：

- localStorageの容量が小さい
- Base64化による容量増加
- ブラウザごとの差が大きい

初期仕様：

```text
Draft
├─ To
├─ Subject
├─ Text
└─ HTML
```

添付付き下書き保存が必要になった場合はIndexedDBへ移行する。

---

## 24. API

### 認証

```text
POST /api/auth
POST /api/logout
```

### メール一覧

```text
GET /api/mails?type=inbox
GET /api/mails?type=sent
```

### メール詳細

```text
GET /api/mails/:type/:id
```

### メール削除

```text
DELETE /api/mails/:type/:id
```

### 保持

```text
POST   /api/mails/:type/:id/retain
DELETE /api/mails/:type/:id/retain
```

### 送信

```text
POST /api/send
```

下書きについてはブラウザローカル管理のため、サーバーAPIを設けない。

---

## 25. Web UI

主要メニュー：

```text
Inbox
Sent
Drafts
Compose
Lock
```

### Inbox / Sent

表示：

```text
☆ GitHub
  Password Reset
  Expires in 5d 12h

★ Important Mail
  Recovery Information
  Kept
```

### Drafts

```text
✎ support@example.com
  Account recovery
  Updated 3 min ago

⚠ example@example.com
  Recovery request
  Send failed
```

### Compose

```text
To
Subject
Body
Attachments

Draft saved 10 sec ago

[Send]
```

---

## 26. メール操作

メール詳細画面では以下を提供する。

```text
Keep / Release
Delete
Reply
```

送信済みメールにも保持機能を利用可能とする。

---

## 27. 削除

手動削除：

```text
DELETE /api/mails/:type/:id
```

保持中メールも削除可能。

ただし保持中メール削除時は、通常メールより強い確認を表示する。

例：

```text
This mail is currently kept.

Delete permanently?
```

---

## 28. データ保存先

```text
Cloudflare KV

Inbox
├─ Raw MIME
├─ Metadata
├─ TTL
└─ Keep

Sent
├─ Raw MIME
├─ Metadata
├─ TTL
└─ Keep


Browser Local Storage

Drafts
├─ 作成途中
├─ 手動保存
└─ 自動保存

Failed
└─ 送信失敗
```

---

## 29. データライフサイクル

### Inbox / Sent

```text
メール受信 / 送信成功
        ↓
Cloudflare KV
        ↓
TTL 7日
        │
        ├→ 7日経過 → 自動削除
        │
        └→ Keep
              ↓
            期限なし
              │
              ├→ 手動削除
              │
              └→ Release
                    ↓
               新たに7日TTL
                    ↓
                 自動削除
```

### Draft / Failed

```text
Compose
   ↓
localStorage
   │
   ├→ 編集継続
   │
   ├→ 手動削除
   │
   └→ Send
         │
         ├→ 成功
         │    ↓
         │   Sentへ保存
         │    ↓
         │   Draft削除
         │
         └→ 失敗
              ↓
          failedとして保持
```

---

## 30. セキュリティ要件

- Cloudflare Access必須
- Worker独自認証必須
- SecretsはWorkers Secretsへ保存
- HTTPSのみ使用
- Raw MIMEをログへ出力しない
- メール本文をログへ出力しない
- API Keyをブラウザへ公開しない
- Session Tokenをログへ出力しない
- HTMLメールをサニタイズ
- 外部画像を自動ロードしない
- CSRF対策
- Rate Limit
- FromアドレスはWorker側固定
- KVキーをクライアントから直接指定させない
- 厳格なCSPを設定
- localStorageへ認証情報を保存しない

---

## 31. localStorageのセキュリティ

localStorageはJavaScriptからアクセス可能なため、XSS対策を重要視する。

- インラインJavaScriptを避ける
- 外部JavaScriptを極力使用しない
- CSPを厳格に設定
- メールHTMLは必ずサニタイズ
- メールHTMLとアプリケーションDOMを可能な限り分離
- 下書きにはSession TokenやAPI Keyを保存しない

---

## 32. 送信基盤移行

現在：

```text
Cloudflare
├─ DNS
├─ Email Routing
├─ Workers
├─ KV
├─ Access
└─ Hono
      ↓
    Resend
```

将来：

```text
Cloudflare
├─ DNS
├─ Email Routing
├─ Workers
├─ KV
├─ Access
├─ Hono
└─ Email Service
```

Cloudflare Email Service移行時はMailSender実装のみを変更し、Web UI・API・KV構造・DraftStoreは変更しない。

---

## 33. 最終構成

```text
                         Internet
                            │
                  recovery@example.com
                            │
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▲
       Email Routing                  Resend
              │                       （現在）
              ▼                           ▲
        Email Worker                      │
              │                           │
              ▼                           │
      ┌────────────────┐                  │
      │ Cloudflare KV  │                  │
      │                │                  │
      │ Inbox Raw MIME │                  │
      │ Sent Raw MIME  │                  │
      │ Metadata       │                  │
      │ TTL / Keep     │                  │
      └────────┬───────┘                  │
               │                          │
               ▼                          │
          Hono Worker ───── MailSender ───┘
               ▲
               │
          第二認証
               ▲
               │
        Cloudflare Access
               ▲
               │
            Browser
               │
               ▼
        ┌───────────────┐
        │ DraftStore    │
        │ localStorage  │
        │               │
        │ Draft         │
        │ Failed        │
        └───────────────┘
```

将来的にはResend部分をCloudflare Email Serviceへ置換し、メール受信・保存・認証・Web UI・送信までCloudflare中心で完結させる。
