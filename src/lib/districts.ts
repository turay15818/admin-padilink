/** The sixteen districts, as the API spells them. Kept here so every picker in the console agrees. */
export const DISTRICTS: { slug: string; name: string }[] = [
  { slug: 'western-area-urban', name: 'Western Area Urban (Freetown)' }, { slug: 'western-area-rural', name: 'Western Area Rural' },
  { slug: 'bo', name: 'Bo' }, { slug: 'bombali', name: 'Bombali (Makeni)' }, { slug: 'bonthe', name: 'Bonthe' }, { slug: 'falaba', name: 'Falaba' },
  { slug: 'kailahun', name: 'Kailahun' }, { slug: 'kambia', name: 'Kambia' }, { slug: 'karene', name: 'Karene' }, { slug: 'kenema', name: 'Kenema' },
  { slug: 'koinadugu', name: 'Koinadugu (Kabala)' }, { slug: 'kono', name: 'Kono (Koidu)' }, { slug: 'moyamba', name: 'Moyamba' }, { slug: 'port-loko', name: 'Port Loko' },
  { slug: 'pujehun', name: 'Pujehun' }, { slug: 'tonkolili', name: 'Tonkolili (Magburaka)' },
];
export const districtName = (slug: string | null | undefined) => DISTRICTS.find(d => d.slug === slug)?.name ?? slug ?? '';
