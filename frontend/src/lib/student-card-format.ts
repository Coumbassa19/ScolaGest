// Pure formatting shared by the HTML student ID card (/student-card) and
// the PDF export (src/lib/server/student-card-pdf.ts).

// "11-05-2000" (DD-MM-YYYY), matching the reference card's date style —
// distinct from the bulletin's spelled-out month format.
export function formatCardDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

// "2024-2025" -> "2024 - 2025", matching the reference card's spaced dash.
export function formatAnneeScolaireDisplay(anneeScolaire: string): string {
  return anneeScolaire.replace(/-/g, ' - ');
}

export function sexeLabel(sexe: string): string {
  return sexe === 'F' ? 'F' : 'M';
}
