import { LETTER_MAX_BYTES, REFUSED_TEXT } from "@mhai/ui/clearances";

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const CAP_TEXT = "The end date can't be more than 12 months away";

const readBytes = (b: Blob): Promise<ArrayBuffer> =>
  typeof b.arrayBuffer === "function"
    ? b.arrayBuffer()
    : new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as ArrayBuffer);
        r.onerror = () => reject(r.error);
        r.readAsArrayBuffer(b);
      });

const startsWith = (head: Uint8Array, ...b: number[]) =>
  b.every((v, i) => head[i] === v);

/**
 * Why a letter file can't be sent, or null. The type comes from the file's
 * first 8 bytes (PDF, PNG or JPEG), never its name or claimed type.
 */
export async function fileProblem(f: File): Promise<string | null> {
  if (f.size > LETTER_MAX_BYTES) return REFUSED_TEXT.file_too_large;
  const head = new Uint8Array(await readBytes(f.slice(0, 8)));
  const ok =
    startsWith(head, 0x25, 0x50, 0x44, 0x46) ||
    startsWith(head, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) ||
    startsWith(head, 0xff, 0xd8, 0xff);
  return ok ? null : REFUSED_TEXT.file_type;
}

/** The end date must be after today and no later than the server's cap. */
export function endDateProblem(
  end: string,
  today: string,
  max: string,
): string | null {
  if (!YMD.test(end) || end <= today) return "Choose an end date after today";
  if (end > max) return CAP_TEXT;
  return null;
}

/** The letter's own date: not in the future, and not after its end date. */
export function letterDateProblem(
  letter: string,
  today: string,
  end: string,
): string | null {
  if (!YMD.test(letter)) return "Enter the letter date";
  if (letter > today) return "The letter date can't be in the future";
  if (YMD.test(end) && letter > end)
    return "The letter date can't be after the end date";
  return null;
}

export const END_DATE_CAP_TEXT = CAP_TEXT;
