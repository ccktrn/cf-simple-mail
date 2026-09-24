import Mailbox from "./mailbox";
import { loadMailbox } from "../lib/mail/mailbox-loader.server";
import { updateMailbox } from "../lib/mail/list-actions.server";

export async function loader(args: { request: Request; context: ReadonlyMap<unknown, unknown> }) { return loadMailbox("sent", args); }
export async function action(args: { request: Request; context: ReadonlyMap<unknown, unknown> }) { return updateMailbox("sent", args); }
export default Mailbox;
