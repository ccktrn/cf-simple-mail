import type { DraftMail } from "./draft";
const KEY = "cf-simple-mail:drafts:v1";
export async function listDrafts(): Promise<DraftMail[]> { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; } }
export async function saveDraft(draft: DraftMail) { const drafts = await listDrafts(), index = drafts.findIndex(item => item.id === draft.id); if (index >= 0) drafts[index] = draft; else drafts.push(draft); localStorage.setItem(KEY, JSON.stringify(drafts)); }
export async function deleteDraft(id: string) { localStorage.setItem(KEY, JSON.stringify((await listDrafts()).filter(draft => draft.id !== id))); }
