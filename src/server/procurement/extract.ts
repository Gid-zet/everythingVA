import "server-only";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel request bodies top out at 4.5 MB

/** Plain text from an uploaded file. Throws a readable message for unsupported files. */
export async function extractText(file: { name: string; type: string; bytes: Uint8Array }): Promise<string> {
  const name = file.name.toLowerCase();
  const type = file.type;

  if (type === "application/pdf" || name.endsWith(".pdf")) {
    const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(file.bytes);
    const { text } = await pdfText(pdf, { mergePages: true });
    const clean = (Array.isArray(text) ? text.join("\n") : text).trim();
    if (clean.length < 20) {
      throw new Error("This PDF has no readable text (it looks scanned). OCR isn't available yet, so paste the text instead.");
    }
    return clean;
  }
  if (name.endsWith(".docx") || type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(file.bytes) });
    return value.trim();
  }
  if (type.startsWith("text/") || /\.(txt|md|csv)$/.test(name)) {
    return new TextDecoder().decode(file.bytes).trim();
  }
  throw new Error("Upload a PDF, Word (.docx) or text file. Excel and images aren't supported yet.");
}
