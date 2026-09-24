import { FilePenLine, Plus, Trash2 } from "lucide-react";
import { Link, useLoaderData } from "react-router";
import { useEffect, useState } from "react";
import { Shell } from "../components/shell";
import { requireSession } from "../lib/auth.server";
import { deleteDraft, listDrafts } from "../lib/draft-store.client";
import type { DraftMail } from "../lib/draft";
import { getCloudflareContext } from "../lib/request-context.server";
import "../styles/drafts.css";

export async function loader({ request, context }: { request: Request; context: ReadonlyMap<unknown, unknown> }) { const { env } = getCloudflareContext(context); await requireSession(request, env); return null; }
const formatDate = (date: string) => new Intl.DateTimeFormat("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(date));

export default function Drafts() {
  useLoaderData<typeof loader>();
  const [drafts, setDrafts] = useState<DraftMail[]>([]);
  useEffect(() => { void listDrafts().then(items => setDrafts(items.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)))); }, []);
  function remove(id: string) { void deleteDraft(id).then(() => setDrafts(items => items.filter(item => item.id !== id))); }
  return <Shell><section className="mail-list"><header className="list-header"><div><p className="eyebrow">DRAFTS</p><h1>下書き</h1></div><span className="count-badge">{drafts.length}</span></header><div className="draft-actions"><p>このブラウザに保存された下書きです。</p><Link className="subtle-button" to="/compose"><Plus size={16} />新規作成</Link></div><div className="messages">{drafts.length ? drafts.map(draft => <div className="draft-row" key={draft.id}><Link className="draft-link" to={`/compose?draft=${draft.id}`}><FilePenLine size={18} /><div className="message-content"><div><b>{draft.to.join(", ") || "宛先なし"}</b><time>{formatDate(draft.updatedAt)}</time></div><strong>{draft.subject || "(件名なし)"}</strong><p>{draft.status === "failed" ? "送信に失敗しました" : "下書き"}</p></div></Link><button className="icon-button" onClick={() => remove(draft.id)} aria-label="下書きを削除" title="下書きを削除"><Trash2 size={18} /></button></div>) : <div className="empty-state"><FilePenLine size={26} /><b>下書きはありません</b><span>作成中のメールは自動的にここへ保存されます。</span></div>}</div></section></Shell>;
}
