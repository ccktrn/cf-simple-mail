import Mailbox from "./mailbox";
import { loadMailbox } from "../lib/mail/mailbox-loader.server";

export async function loader(args: { request: Request; context: ReadonlyMap<unknown, unknown> }) { return loadMailbox("sent", args); }
export default Mailbox;
