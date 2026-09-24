import { hashPassword } from "../app/lib/auth/password.server";

const password = process.argv[2];
if (!password) throw new Error("Usage: bun run hash-password -- '<password>'");
console.log(await hashPassword(password));
