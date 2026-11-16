/**
 * Host half of dsh-task-hub.
 *
 * M0 ships the Client panel only: the bundle row exists so the Client module
 * loads and the panel appears in the left rail. The Host service (task store,
 * CalDAV/Google sync, IMAP) and the agent tools land in M1+; until then this
 * entry deliberately registers nothing.
 */
export function apply() {}
