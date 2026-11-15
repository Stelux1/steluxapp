/** A user's own signatures (pilots profile): the reference's full and short signature with their image sizes. */
export const SIGNATURE_KINDS = [
  { kind: 'Full signature', width: 800, height: 200 },
  { kind: 'Short signature', width: 300, height: 200 },
] as const;
export type SignatureKind = typeof SIGNATURE_KINDS[number]['kind'];
/** Largest signature image accepted (drawn PNGs are far smaller). */
export const SIGNATURE_MAX_BYTES = 1024 * 1024;
export const SIGNATURE_TYPES: Record<string, { extension: RegExp; magic: number[] }> = {
  'image/png': { extension: /\.png$/i, magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  'image/jpeg': { extension: /\.jpe?g$/i, magic: [0xff, 0xd8, 0xff] },
};
/** Whether a file's declared type, name and first bytes agree on PNG or JPEG. */
export function signatureImageValid(mime: string, name: string, head: Uint8Array): boolean {
  const type = SIGNATURE_TYPES[mime];
  return Boolean(type) && type.extension.test(name) && head.length >= type.magic.length && type.magic.every((byte, i) => head[i] === byte);
}
