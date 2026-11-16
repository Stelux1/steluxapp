/**
 * The facts of the Identification card besides the ISO No slot (reference: ISO No with IRN and Rev, then Asset tag).
 * "Drawing no." is hidden there in both pilots; it stays in Edit isometric.
 */
export const IDENTIFICATION_FACTS: { label: string; field: string }[] = [{ label: 'Asset tag', field: 'assetTag' }];
