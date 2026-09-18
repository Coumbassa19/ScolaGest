/**
 * SMS abstraction — deliberately mirrors `Mailer` in `./email.ts` so wiring
 * a real provider later is a drop-in: implement `send()` against the chosen
 * SDK (Twilio, Africa's Talking, ...) inside `createSmsSender`, set its env
 * vars, and every call site (src/lib/server/messages.ts, the /messages UI)
 * starts working without further changes.
 *
 * No provider is configured yet (school's choice, 2026-09-15) — `getSmsSender`
 * always returns null for now, and callers must treat that as "channel not
 * available" rather than silently skipping the send.
 */
export interface SendSmsInput {
  to: string;
  body: string;
}

export interface SmsSender {
  send(input: SendSmsInput): Promise<{ id: string }>;
}

export interface CreateSmsSenderEnv {
  SMS_PROVIDER_API_KEY?: string | undefined;
}

/**
 * Returns null when no SMS provider is configured. Once one is chosen,
 * implement the real client here (reading its own env vars) and this
 * factory starts returning a working sender — no other file needs to change.
 */
export function createSmsSender(env: CreateSmsSenderEnv): SmsSender | null {
  if (!env.SMS_PROVIDER_API_KEY) return null;

  // Placeholder — replace with the real provider call once one is chosen.
  throw new Error('createSmsSender: SMS_PROVIDER_API_KEY is set but no provider client is wired yet.');
}

let _sender: SmsSender | null = null;
let _initialized = false;

/** Lazy singleton — mirrors getEmailQueue()'s null-when-unconfigured pattern. */
export function getSmsSender(): SmsSender | null {
  if (_initialized) return _sender;
  _sender = createSmsSender({ SMS_PROVIDER_API_KEY: process.env.SMS_PROVIDER_API_KEY });
  _initialized = true;
  return _sender;
}

/** Test-only — clear the cached sender. */
export function __resetSmsSenderSingleton(): void {
  _sender = null;
  _initialized = false;
}
