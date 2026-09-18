// Data for the student ID card (/student-cards) — one student's own record
// plus the school's identity settings (name, logo, République, devise).
// Shared by the HTML card page and the PDF export so both always show
// exactly the same thing for a given student.
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { getSchoolSettings, type SchoolSettingsData } from '@/lib/server/school-settings';

export interface StudentCardData {
  studentId: string;
  classId: string;
  nom: string;
  prenom: string;
  dateNaissance: Date | null;
  sexe: string;
  matricule: string;
  className: string;
  anneeScolaire: string;
  photoUrl: string | null;
  parentTelephone: string | null;
  school: SchoolSettingsData;
}

function toCardData(
  student: {
    id: string;
    classId: string;
    nom: string;
    prenom: string;
    dateNaissance: Date | null;
    sexe: string;
    matricule: string;
    anneeScolaire: string;
    photoUrl: string | null;
    parentTelephone: string | null;
    schoolClass: { name: string };
  },
  school: SchoolSettingsData,
): StudentCardData {
  return {
    studentId: student.id,
    classId: student.classId,
    nom: student.nom,
    prenom: student.prenom,
    dateNaissance: student.dateNaissance,
    sexe: student.sexe,
    matricule: student.matricule,
    className: student.schoolClass.name,
    anneeScolaire: student.anneeScolaire,
    photoUrl: student.photoUrl,
    parentTelephone: student.parentTelephone,
    school,
  };
}

export async function getStudentCardData(
  prisma: PrismaClient,
  schoolId: string,
  studentId: string,
): Promise<StudentCardData | null> {
  const [student, school] = await Promise.all([
    prisma.student.findUnique({ where: { id: studentId }, include: { schoolClass: true } }),
    getSchoolSettings(prisma, schoolId),
  ]);
  if (!student) return null;
  return toCardData(student, school);
}

export async function getClassCardData(
  prisma: PrismaClient,
  schoolId: string,
  classId: string,
): Promise<StudentCardData[]> {
  const [students, school] = await Promise.all([
    prisma.student.findMany({
      where: { classId },
      include: { schoolClass: true },
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    }),
    getSchoolSettings(prisma, schoolId),
  ]);
  return students.map((s) => toCardData(s, school));
}
