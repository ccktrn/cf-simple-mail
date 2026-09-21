export type MailType = "inbox" | "sent";
export interface MailMetadata { direction: MailType; from: string; to: string; subject: string; timestamp: string; retained: boolean; expiresAt: string | null; messageId?: string }
export interface MailListItem extends MailMetadata { id: string }
export interface MailMessage { from: string; to: string[]; subject: string; text?: string; html?: string }
export interface SendResult { id: string; provider: "resend" | "cloudflare" }
