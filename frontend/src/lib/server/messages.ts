// Core send logic for the "Messages" feature (src/app/messages). One call =
// one recipient + one channel, always ending in a SchoolMessage row so the
// history page is a complete, honest record — including the cases where
// nothing was actually sent (no contact on file, SMS not configured yet,
// the mailer rejected it). Never claim success unless delivery to the
// provider was confirmed. Recipients are either a student's parent or a
// teacher — see message-templates.ts for how the wording adapts to each.
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
import { getSmsSender } from '@/lib/server/sms';
import { getSchoolSettings } from '@/lib/server/school-settings';
import {
  renderMessageTemplate,
  type MessageAudience,
  type MessageTemplateType,
  type MessageTemplateVars,
  type MessageLocale,
} from '@/lib/message-templates';

export type MessageChannel = 'EMAIL' | 'SMS';
export type MessageRecipientType = 'STUDENT_PARENT' | 'TEACHER';
export type SendResultStatus = 'SENT' | 'PENDING' | 'FAILED' | 'UNAVAILABLE' | 'SKIPPED';

export interface SendSchoolMessageInput {
  recipientType: MessageRecipientType;
  /** studentId when recipientType is STUDENT_PARENT, teacherId when TEACHER. */
  targetId: string;
  channel: MessageChannel;
  templateType: MessageTemplateType;
  /** ABSENCE — defaults to today (French long date) when omitted. */
  date?: string | undefined;
  /** CONVOCATION only. */
  motif?: string | undefined;
  /** LIBRE only. */
  customSubject?: string | undefined;
  customBody?: string | undefined;
  /** Language the outgoing message itself is rendered in. Defaults to French. */
  locale?: MessageLocale | undefined;
}

export interface SendSchoolMessageResult {
  targetId: string;
  targetName: string;
  recipientType: MessageRecipientType;
  channel: MessageChannel;
  status: SendResultStatus;
  reason?: string | undefined;
  messageId?: string;
}

function formatToday(locale: MessageLocale): string {
  return new Date().toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function bodyToHtml(body: string): string {
  const escaped = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<p>${escaped.replace(/\n/g, '<br />')}</p>`;
}

export async function sendSchoolMessage(
  prisma: PrismaClient,
  schoolId: string,
  input: SendSchoolMessageInput,
): Promise<SendSchoolMessageResult> {
  const school = await getSchoolSettings(prisma, schoolId);
  const locale: MessageLocale = input.locale ?? 'fr';

  let targetName: string;
  let recipientContact: string | null;
  let vars: MessageTemplateVars;
  let audience: MessageAudience;
  let fkData: { studentId?: string; teacherId?: string };
  let noContactReason: string;

  if (input.recipientType === 'STUDENT_PARENT') {
    const student = await prisma.student.findUnique({
      where: { id: input.targetId },
      include: { schoolClass: true },
    });
    if (!student) {
      return {
        targetId: input.targetId,
        targetName: '',
        recipientType: input.recipientType,
        channel: input.channel,
        status: 'FAILED',
        reason: locale === 'en' ? 'Student not found' : 'Élève introuvable',
      };
    }
    targetName = `${student.prenom} ${student.nom}`;
    recipientContact = input.channel === 'EMAIL' ? student.parentEmail : student.parentTelephone;
    audience = 'PARENT';
    vars = {
      eleveNom: student.nom,
      elevePrenom: student.prenom,
      classe: student.schoolClass.name,
      ecole: school.name,
      date: input.date || formatToday(locale),
      ...(student.parentNom ? { parentNom: student.parentNom } : {}),
      ...(input.motif ? { motif: input.motif } : {}),
    };
    fkData = { studentId: student.id };
    noContactReason =
      input.channel === 'EMAIL'
        ? locale === 'en'
          ? 'No parent email on file for this student'
          : 'Aucun email de parent enregistré pour cet élève'
        : locale === 'en'
          ? 'No parent phone number on file for this student'
          : 'Aucun téléphone de parent enregistré pour cet élève';
  } else {
    const teacher = await prisma.teacher.findUnique({ where: { id: input.targetId } });
    if (!teacher) {
      return {
        targetId: input.targetId,
        targetName: '',
        recipientType: input.recipientType,
        channel: input.channel,
        status: 'FAILED',
        reason: locale === 'en' ? 'Teacher not found' : 'Professeur introuvable',
      };
    }
    targetName = `${teacher.prenom} ${teacher.nom}`;
    recipientContact = input.channel === 'EMAIL' ? teacher.email : teacher.telephone;
    audience = 'TEACHER';
    vars = {
      professeurNom: teacher.nom,
      professeurPrenom: teacher.prenom,
      ecole: school.name,
      date: input.date || formatToday(locale),
      ...(input.motif ? { motif: input.motif } : {}),
    };
    fkData = { teacherId: teacher.id };
    noContactReason =
      input.channel === 'EMAIL'
        ? locale === 'en'
          ? 'No email on file for this teacher'
          : 'Aucun email enregistré pour ce professeur'
        : locale === 'en'
          ? 'No phone number on file for this teacher'
          : 'Aucun téléphone enregistré pour ce professeur';
  }

  const rendered = renderMessageTemplate(
    input.templateType,
    audience,
    vars,
    {
      ...(input.customSubject !== undefined ? { subject: input.customSubject } : {}),
      ...(input.customBody !== undefined ? { body: input.customBody } : {}),
    },
    locale,
  );

  async function persist(
    status: SendResultStatus,
    options?: { errorReason?: string; emailJobId?: string; sentAt?: Date },
  ): Promise<SendSchoolMessageResult> {
    const row = await prisma.schoolMessage.create({
      data: {
        schoolId,
        recipientType: input.recipientType,
        ...fkData,
        channel: input.channel,
        templateType: input.templateType,
        recipient: recipientContact ?? '',
        subject: rendered.subject,
        body: rendered.body,
        status,
        ...(options?.errorReason ? { errorReason: options.errorReason } : {}),
        ...(options?.emailJobId ? { emailJobId: options.emailJobId } : {}),
        ...(options?.sentAt ? { sentAt: options.sentAt } : {}),
      },
    });
    return {
      targetId: input.targetId,
      targetName,
      recipientType: input.recipientType,
      channel: input.channel,
      status,
      reason: options?.errorReason,
      messageId: row.id,
    };
  }

  if (!recipientContact) {
    // Logged (not silently dropped) — the admin needs to see who couldn't be
    // reached so they can follow up another way (phone call, note home).
    return persist('SKIPPED', { errorReason: noContactReason });
  }

  if (input.channel === 'EMAIL') {
    const queue = getEmailQueue();
    if (!queue) {
      return persist('UNAVAILABLE', {
        errorReason:
          locale === 'en' ? 'Email sending service not configured' : "Service d'envoi d'e-mail non configuré",
      });
    }

    const emailJobId = await queue.enqueue({
      to: recipientContact,
      subject: rendered.subject,
      html: bodyToHtml(rendered.body),
      text: rendered.body,
    });
    // Send THIS job directly for immediate feedback (this is a small,
    // deliberate admin action — the admin wants to know now whether the
    // recipient was reached). `drainOne()` would claim whatever is oldest
    // in the queue, which is the wrong job whenever a backlog exists — see
    // EmailQueue.sendNow() for why that left messages stuck at PENDING.
    // The regular cron drain (vercel.json) is still the durability net for
    // retries if this attempt fails.
    const sendResult = await queue.sendNow(emailJobId);
    const status: SendResultStatus = sendResult.status === 'SENT' ? 'SENT' : 'FAILED';

    return persist(status, {
      emailJobId,
      ...(sendResult.lastError ? { errorReason: sendResult.lastError } : {}),
      ...(status === 'SENT' ? { sentAt: new Date() } : {}),
    });
  }

  // SMS
  const sender = getSmsSender();
  if (!sender) {
    return persist('UNAVAILABLE', {
      errorReason:
        locale === 'en'
          ? 'SMS not configured — no provider is connected to the application yet.'
          : "SMS non configuré — aucun fournisseur n'est encore relié à l'application.",
    });
  }

  try {
    await sender.send({ to: recipientContact, body: rendered.body });
    return persist('SENT', { sentAt: new Date() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return persist('FAILED', { errorReason: message });
  }
}

export interface ResendSchoolMessageResult extends SendSchoolMessageResult {
  originalMessageId: string;
}

/**
 * Re-attempt delivery of a past SchoolMessage — the natural companion to a
 * FAILED/UNAVAILABLE history row (most commonly: the mailer was down, or a
 * transient provider error). Re-sends the EXACT recipient/subject/body that
 * were already rendered and stored on the original row rather than
 * re-deriving them from the student/teacher record, so a resend always
 * reproduces what the admin actually reviewed and sent the first time —
 * even if the contact's info has since changed. Always creates a NEW
 * SchoolMessage row (history stays append-only, both attempts stay visible)
 * instead of mutating the original.
 */
export async function resendSchoolMessage(
  prisma: PrismaClient,
  schoolId: string,
  messageId: string,
  locale: MessageLocale = 'fr',
): Promise<ResendSchoolMessageResult> {
  const found = await prisma.schoolMessage.findUnique({
    where: { id: messageId },
    include: { student: true, teacher: true },
  });
  if (!found) {
    throw new Error(locale === 'en' ? 'Message not found' : 'Message introuvable');
  }
  // Rebind to a const so the null-check narrows for the closures below —
  // TS can't carry a narrowed type on `let`/outer-param bindings into a
  // nested function, but a fresh `const` retains it.
  const original = found;

  const targetName =
    original.recipientType === 'TEACHER'
      ? `${original.teacher?.prenom ?? ''} ${original.teacher?.nom ?? ''}`.trim()
      : `${original.student?.prenom ?? ''} ${original.student?.nom ?? ''}`.trim();

  async function persist(
    status: SendResultStatus,
    options?: { errorReason?: string; emailJobId?: string; sentAt?: Date },
  ): Promise<ResendSchoolMessageResult> {
    const row = await prisma.schoolMessage.create({
      data: {
        schoolId,
        recipientType: original.recipientType,
        ...(original.studentId ? { studentId: original.studentId } : {}),
        ...(original.teacherId ? { teacherId: original.teacherId } : {}),
        channel: original.channel,
        templateType: original.templateType,
        recipient: original.recipient,
        subject: original.subject,
        body: original.body,
        status,
        ...(options?.errorReason ? { errorReason: options.errorReason } : {}),
        ...(options?.emailJobId ? { emailJobId: options.emailJobId } : {}),
        ...(options?.sentAt ? { sentAt: options.sentAt } : {}),
      },
    });
    return {
      targetId: original.studentId ?? original.teacherId ?? '',
      targetName,
      recipientType: original.recipientType as MessageRecipientType,
      channel: original.channel as MessageChannel,
      status,
      reason: options?.errorReason,
      messageId: row.id,
      originalMessageId: original.id,
    };
  }

  if (!original.recipient) {
    return persist('SKIPPED', {
      errorReason:
        locale === 'en'
          ? 'No contact on file for this recipient'
          : 'Aucun contact enregistré pour ce destinataire',
    });
  }

  if (original.channel === 'EMAIL') {
    const queue = getEmailQueue();
    if (!queue) {
      return persist('UNAVAILABLE', {
        errorReason:
          locale === 'en' ? 'Email sending service not configured' : "Service d'envoi d'e-mail non configuré",
      });
    }
    const emailJobId = await queue.enqueue({
      to: original.recipient,
      subject: original.subject ?? '',
      html: bodyToHtml(original.body),
      text: original.body,
    });
    const sendResult = await queue.sendNow(emailJobId);
    const status: SendResultStatus = sendResult.status === 'SENT' ? 'SENT' : 'FAILED';
    return persist(status, {
      emailJobId,
      ...(sendResult.lastError ? { errorReason: sendResult.lastError } : {}),
      ...(status === 'SENT' ? { sentAt: new Date() } : {}),
    });
  }

  // SMS
  const sender = getSmsSender();
  if (!sender) {
    return persist('UNAVAILABLE', {
      errorReason:
        locale === 'en'
          ? 'SMS not configured — no provider is connected to the application yet.'
          : "SMS non configuré — aucun fournisseur n'est encore relié à l'application.",
    });
  }
  try {
    await sender.send({ to: original.recipient, body: original.body });
    return persist('SENT', { sentAt: new Date() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return persist('FAILED', { errorReason: message });
  }
}
