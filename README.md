# cf-simple-mail

Cloudflare Workers、KV、React Router v7 を使う、データベース不要のリカバリメールシステムです。受信メールと送信成功メールは Raw MIME のまま KV に 7 日間保存し、下書きと送信失敗メールはブラウザの localStorage にだけ保存します。

## 開発

```sh
bun install
bun run dev
```

本番用に `wrangler.jsonc` の `MAIL_KV` の ID と `MAIL_FROM_ADDRESSES` を設定してください。これは送信元に選べるアドレスの JSON 配列で、Resend で検証済みのアドレスだけを指定します。互換用の単一 `MAIL_FROM` も利用できますが、新規設定では前者を使用してください。次の値は Wrangler secret として設定します。

```sh
bunx wrangler secret put AUTH_PASSWORD_VERIFIER
bunx wrangler secret put SESSION_SECRET
bunx wrangler secret put RESEND_API_KEY
```

`AUTH_PASSWORD_VERIFIER` は Argon2id（19 MiB・2 iterations・parallelism 1）の検証値です。次で生成した値をそのまま登録します。Worker 全体を Cloudflare Access 配下に置いた上で使います。

```sh
bun run hash-password -- '長くユニークなパスワード'
```

```sh
bun run check
bun test
bun run build
```

`build` は React Router v7 と Cloudflare Vite plugin により Worker と静的アセットを `build/` に生成します。デプロイには `bun run deploy` を使用してください。
