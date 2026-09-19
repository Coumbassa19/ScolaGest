// Shared pdfkit helpers for drawing a data: URL image (PNG/JPEG only —
// pdfkit can't rasterize SVG). `drawCoverImage` crops to fill a box without
// distorting aspect ratio (CSS `object-fit: cover`); `drawContainImage`
// scales the whole image to fit inside a box, uncropped (CSS `object-fit:
// contain`). Used by the bulletin logo (src/lib/server/bulletin-pdf.ts) and
// the student ID card's logo, photo, and watermark
// (src/lib/server/student-card-pdf.ts), so all crop/fit identically.
import 'server-only';

const DATA_URL_RE = /^data:image\/(png|jpe?g);base64,(.+)$/i;

export interface DrawImageOptions {
  /** Clip to a circle inscribed in the box instead of the box itself. */
  circle?: boolean;
  /** Clip to a rounded rectangle with this corner radius (ignored if `circle`). */
  radius?: number;
}

// Returns false — leaving nothing drawn — when there's no image or it can't
// be decoded, so the caller can fall back to a placeholder.
export function drawCoverImage(
  doc: PDFKit.PDFDocument,
  dataUrl: string | null,
  x: number,
  y: number,
  width: number,
  height: number,
  options?: DrawImageOptions,
): boolean {
  if (!dataUrl) return false;
  const match = DATA_URL_RE.exec(dataUrl);
  if (!match) return false;
  doc.save();
  try {
    if (options?.circle) {
      doc.circle(x + width / 2, y + height / 2, Math.min(width, height) / 2).clip();
    } else if (options?.radius) {
      doc.roundedRect(x, y, width, height, options.radius).clip();
    }
    const buffer = Buffer.from(match[2] ?? '', 'base64');
    doc.image(buffer, x, y, { cover: [width, height], align: 'center', valign: 'center' });
    return true;
  } catch {
    return false;
  } finally {
    doc.restore();
  }
}

// Same decoding as drawCoverImage, but scales the whole image to fit inside
// the box uncropped (pdfkit's `fit` option), optionally at reduced opacity —
// used for a plain, undistorted logo placement and for a faint logo
// watermark. Callers must not already be inside a doc.save()/restore() pair
// that changes fill/stroke opacity, since this restores full opacity itself.
export function drawContainImage(
  doc: PDFKit.PDFDocument,
  dataUrl: string | null,
  x: number,
  y: number,
  width: number,
  height: number,
  opacity = 1,
): boolean {
  if (!dataUrl) return false;
  const match = DATA_URL_RE.exec(dataUrl);
  if (!match) return false;
  doc.save();
  try {
    if (opacity < 1) doc.opacity(opacity);
    const buffer = Buffer.from(match[2] ?? '', 'base64');
    doc.image(buffer, x, y, { fit: [width, height], align: 'center', valign: 'center' });
    return true;
  } catch {
    return false;
  } finally {
    doc.restore();
  }
}
