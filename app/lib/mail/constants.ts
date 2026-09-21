export const DEFAULT_MAIL_TTL_SECONDS = 60 * 60 * 24 * 7;
export const DEFAULT_SESSION_TTL_SECONDS = 60 * 30;
export const MAX_MAIL_SIZE = 20 * 1024 * 1024;
export const MAIL_PREFIX = { inbox: "mail:inbox:", sent: "mail:sent:" } as const;
export const SESSION_COOKIE = "__Host-recovery_session";
