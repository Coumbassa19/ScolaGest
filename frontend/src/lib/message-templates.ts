// Message templates for the "Messages" feature (src/app/messages) — shared,
// pure module so the composer's live preview (client) and the actual send
// (server, src/lib/server/messages.ts) render the exact same text from the
// exact same placeholders.
//
// Two audiences share the same template catalogue: a student's parent, or a
// teacher. ABSENCE only makes sense for a parent (the school's stated
// priority: warn a parent the same day their child wasn't at school);
// CONVOCATION (a meeting request) and LIBRE (free-form) apply to either —
// `audience` picks the right phrasing/fields for each.
//
// `locale` renders the outgoing message itself in French or English — two of
// the school's partner establishments teach in English, so their outgoing
// parent/teacher communications need to match, not just the admin UI chrome.
// It defaults to 'fr' so any caller that doesn't pass it keeps today's
// behaviour unchanged.
export type MessageAudience = 'PARENT' | 'TEACHER';
export type MessageTemplateType = 'ABSENCE' | 'CONVOCATION' | 'LIBRE';
export type MessageLocale = 'fr' | 'en';

export interface MessageTemplateVars {
  // Parent audience — the student's own info.
  eleveNom?: string;
  elevePrenom?: string;
  classe?: string;
  parentNom?: string;
  // Teacher audience.
  professeurNom?: string;
  professeurPrenom?: string;
  // Shared.
  ecole: string;
  date: string;
  /** CONVOCATION only — reason/subject of the meeting. */
  motif?: string;
}

export interface RenderedMessage {
  subject: string;
  body: string;
}

export const MESSAGE_TEMPLATE_LABELS: Record<MessageTemplateType, string> = {
  ABSENCE: 'Absence',
  CONVOCATION: 'Convocation / réunion',
  LIBRE: 'Message libre',
};

export const TEMPLATES_BY_AUDIENCE: Record<MessageAudience, MessageTemplateType[]> = {
  PARENT: ['ABSENCE', 'CONVOCATION', 'LIBRE'],
  TEACHER: ['CONVOCATION', 'LIBRE'],
};

function parentGreeting(vars: MessageTemplateVars, locale: MessageLocale): string {
  if (locale === 'en') {
    return vars.parentNom ? `Dear ${vars.parentNom},` : 'Dear Parent/Guardian,';
  }
  return vars.parentNom ? `Bonjour ${vars.parentNom},` : 'Bonjour,';
}

function teacherGreeting(vars: MessageTemplateVars, locale: MessageLocale): string {
  const name = [vars.professeurPrenom, vars.professeurNom].filter(Boolean).join(' ');
  if (locale === 'en') {
    return name ? `Dear ${name},` : 'Dear Colleague,';
  }
  return name ? `Bonjour ${name},` : 'Bonjour,';
}

/**
 * Renders a template to its final subject/body for one recipient. For
 * LIBRE, `customSubject`/`customBody` (written by the admin) are used as-is
 * — the template system still routes it through here so every send,
 * whatever its origin, produces one consistent SchoolMessage row.
 */
export function renderMessageTemplate(
  type: MessageTemplateType,
  audience: MessageAudience,
  vars: MessageTemplateVars,
  custom?: { subject?: string; body?: string },
  locale: MessageLocale = 'fr',
): RenderedMessage {
  switch (type) {
    case 'ABSENCE': {
      const eleve = `${vars.elevePrenom ?? ''} ${vars.eleveNom ?? ''}`.trim();
      if (locale === 'en') {
        return {
          subject: `Absence — ${eleve} — ${vars.date}`,
          body: [
            parentGreeting(vars, locale),
            '',
            `We are writing to let you know that your child ${eleve} (${vars.classe ?? ''}) was not present at school on ${vars.date}.`,
            '',
            'Please contact us if this absence was unplanned, or to provide supporting documentation.',
            '',
            vars.ecole,
          ].join('\n'),
        };
      }
      return {
        subject: `Absence de ${eleve} — ${vars.date}`,
        body: [
          parentGreeting(vars, locale),
          '',
          `Nous vous informons que votre enfant ${eleve} (${vars.classe ?? ''}) n'était pas présent(e) à l'école le ${vars.date}.`,
          '',
          "Merci de bien vouloir nous contacter si cette absence n'était pas prévue ou pour toute justification.",
          '',
          vars.ecole,
        ].join('\n'),
      };
    }
    case 'CONVOCATION': {
      if (audience === 'TEACHER') {
        if (locale === 'en') {
          return {
            subject: `Meeting Request — ${vars.ecole}`,
            body: [
              teacherGreeting(vars, locale),
              '',
              `We would like to meet with you${vars.motif ? ` regarding: ${vars.motif}` : '.'}`,
              '',
              'Please contact us to arrange a suitable time.',
              '',
              vars.ecole,
            ].join('\n'),
          };
        }
        return {
          subject: `Convocation — ${vars.ecole}`,
          body: [
            teacherGreeting(vars, locale),
            '',
            `Nous souhaitons vous rencontrer${vars.motif ? ` : ${vars.motif}` : '.'}`,
            '',
            "Merci de nous contacter pour convenir d'un rendez-vous.",
            '',
            vars.ecole,
          ].join('\n'),
        };
      }
      const eleve = `${vars.elevePrenom ?? ''} ${vars.eleveNom ?? ''}`.trim();
      if (locale === 'en') {
        return {
          subject: `Meeting Request — Parent of ${eleve}`,
          body: [
            parentGreeting(vars, locale),
            '',
            `We would like to meet with you regarding your child ${eleve} (${vars.classe ?? ''})${vars.motif ? `: ${vars.motif}` : '.'}`,
            '',
            'Please come to the school or contact us to arrange a suitable time.',
            '',
            vars.ecole,
          ].join('\n'),
        };
      }
      return {
        subject: `Convocation — Parent de ${eleve}`,
        body: [
          parentGreeting(vars, locale),
          '',
          `Nous souhaitons vous rencontrer au sujet de votre enfant ${eleve} (${vars.classe ?? ''})${vars.motif ? ` : ${vars.motif}` : '.'}`,
          '',
          "Merci de vous présenter à l'école ou de nous contacter pour convenir d'un rendez-vous.",
          '',
          vars.ecole,
        ].join('\n'),
      };
    }
    case 'LIBRE':
      return {
        subject:
          custom?.subject?.trim() ||
          (locale === 'en' ? `Message from ${vars.ecole}` : `Message de ${vars.ecole}`),
        body: custom?.body?.trim() || '',
      };
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown template type: ${String(_exhaustive)}`);
    }
  }
}
