import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteError } from "react-router";
import "./styles/app.css";

export function Layout({ children }: { children: React.ReactNode }) { return <html lang="ja"><head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><Meta /><Links /></head><body>{children}<ScrollRestoration /><Scripts /></body></html>; }
export default function Root() { return <Outlet />; }
export function ErrorBoundary() { const error = useRouteError(), message = isRouteErrorResponse(error) ? (error.status === 404 ? "ページが見つかりません" : "リクエストを処理できませんでした") : "予期しないエラーが発生しました"; return <main className="login-shell"><section className="login-card"><p className="eyebrow">RECOVERY MAIL</p><h1>{message}</h1><p className="login-copy">時間をおいてもう一度お試しください。</p><a className="primary-button" href="/inbox">受信トレイへ戻る</a></section></main>; }
