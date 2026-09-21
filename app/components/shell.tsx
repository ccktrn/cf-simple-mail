import { Inbox, LockKeyhole, Mail, PenLine, Send, ShieldCheck } from "lucide-react";
import { Form, Link, useLocation } from "react-router";

export function Shell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return <main className="app-shell"><aside className="sidebar"><Link className="logo" to="/inbox"><span className="logo-icon"><Mail size={19} /></span><span>Recovery Mail</span></Link><Link className="compose-button" to="/compose"><PenLine size={17} />作成</Link><nav><Link className={pathname === "/inbox" ? "nav-item active" : "nav-item"} to="/inbox"><Inbox size={18} />受信トレイ</Link><Link className={pathname === "/sent" ? "nav-item active" : "nav-item"} to="/sent"><Send size={18} />送信済み</Link></nav><div className="sidebar-bottom"><Form action="/logout" method="post"><button className="nav-item"><LockKeyhole size={18} />ロック</button></Form><p><ShieldCheck size={14} />暗号化されたセッション</p></div></aside><div className="workspace">{children}</div></main>;
}
