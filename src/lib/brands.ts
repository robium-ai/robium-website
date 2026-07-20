// Brand-mark lookup shared by the skills table and the catalog belt, so a
// "ROS 2" pill carries the same logo everywhere. Data: integrations.json
// (brand → logo file, provenance in public/logos/README.md) and
// skill-brands.json (tool skill → brand; umbrellas absent on purpose).

import integrations from '../data/integrations.json';
import skillBrands from '../data/skill-brands.json';
import { tagsFor } from './catalog';

export type Pill = { text: string; logo: string | null };

const fileByBrand = new Map(integrations.map((i) => [i.name.toLowerCase(), i.file]));

/** Logo file for an exact brand name (case-insensitive), or null. */
export const brandLogo = (text: string): string | null =>
  fileByBrand.get(text.trim().toLowerCase()) ?? null;

/**
 * The pill list for a skill: its brand first (tool skills only), then its
 * topic tags — each decorated with a logo when the text IS a brand name.
 */
export function brandedTags(skill: string): Pill[] {
  const pills: Pill[] = [];
  const brand = (skillBrands as Record<string, string>)[skill];
  if (brand) pills.push({ text: brand, logo: brandLogo(brand) });
  for (const t of tagsFor(skill)) {
    if (brand && t.toLowerCase() === brand.toLowerCase()) continue; // no dupes
    pills.push({ text: t, logo: brandLogo(t) });
  }
  return pills;
}
