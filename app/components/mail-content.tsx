import { useEffect, useState } from "react";

export function MailContent({ raw }: { raw: string }) {
  const [html, setHtml] = useState("<p class='loading-mail'>メールを読み込んでいます…</p>");
  useEffect(() => { void (async () => { try { const [{ default: PostalMime }, { default: DOMPurify }] = await Promise.all([import("postal-mime"), import("dompurify")]); const mail = await PostalMime.parse(raw); const body = mail.html ? DOMPurify.sanitize(mail.html, { FORBID_TAGS: ["img", "iframe", "object", "embed", "style"], FORBID_ATTR: ["style"] }) : `<pre>${(mail.text ?? "").replace(/[&<>\"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]!))}</pre>`; setHtml(body); } catch { setHtml("<p>メールを表示できませんでした。</p>"); } })(); }, [raw]);
  return <div className="mail-body" dangerouslySetInnerHTML={{ __html: html }} />;
}
