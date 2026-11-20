import { normalizeLabel } from './normalize';

// One row per place: the canonical name first, then its aliases. Every entry is
// stored the way normalizeLabel writes it. The table exists so a question about
// another place is never answered with the owner's own country, so recognising
// one place too many is the safe direction.
export const COUNTRY_TABLE: readonly (readonly string[])[] = [
  ['afghanistan'],
  ['albania'],
  ['algeria'],
  ['andorra'],
  ['angola'],
  ['antigua and barbuda'],
  ['argentina'],
  ['armenia'],
  ['australia'],
  ['austria'],
  ['azerbaijan'],
  ['bahamas', 'the bahamas'],
  ['bahrain'],
  ['bangladesh'],
  ['barbados'],
  ['belarus'],
  ['belgium'],
  ['belize'],
  ['benin'],
  ['bhutan'],
  ['bolivia'],
  ['bosnia and herzegovina', 'bosnia'],
  ['botswana'],
  ['brazil'],
  ['brunei', 'brunei darussalam'],
  ['bulgaria'],
  ['burkina faso'],
  ['burundi'],
  ['cambodia'],
  ['cameroon'],
  ['canada'],
  ['cape verde', 'cabo verde'],
  ['central african republic'],
  ['chad'],
  ['chile'],
  ['china'],
  ['colombia'],
  ['comoros'],
  ['congo', 'republic of the congo'],
  ['costa rica'],
  ['croatia'],
  ['cuba'],
  ['cyprus'],
  ['czechia', 'czech republic'],
  ['democratic republic of the congo', 'dr congo'],
  ['denmark'],
  ['djibouti'],
  ['dominica'],
  ['dominican republic'],
  ['ecuador'],
  ['egypt'],
  ['el salvador'],
  ['equatorial guinea'],
  ['eritrea'],
  ['estonia'],
  ['eswatini', 'swaziland'],
  ['ethiopia'],
  ['fiji'],
  ['finland'],
  ['france'],
  ['gabon'],
  ['gambia', 'the gambia'],
  ['georgia'],
  ['germany'],
  ['ghana'],
  ['greece'],
  ['grenada'],
  ['guatemala'],
  ['guinea'],
  ['guinea bissau'],
  ['guyana'],
  ['haiti'],
  ['honduras'],
  ['hungary'],
  ['iceland'],
  ['india'],
  ['indonesia'],
  ['iran'],
  ['iraq'],
  ['ireland'],
  ['israel'],
  ['italy'],
  ['ivory coast', 'cote d ivoire', 'côte d ivoire'],
  ['jamaica'],
  ['japan'],
  ['jordan'],
  ['kazakhstan'],
  ['kenya'],
  ['kiribati'],
  ['kuwait'],
  ['kyrgyzstan'],
  ['laos'],
  ['latvia'],
  ['lebanon'],
  ['lesotho'],
  ['liberia'],
  ['libya'],
  ['liechtenstein'],
  ['lithuania'],
  ['luxembourg'],
  ['madagascar'],
  ['malawi'],
  ['malaysia'],
  ['maldives'],
  ['mali'],
  ['malta'],
  ['marshall islands'],
  ['mauritania'],
  ['mauritius'],
  ['mexico'],
  ['micronesia', 'federated states of micronesia'],
  ['moldova'],
  ['monaco'],
  ['mongolia'],
  ['montenegro'],
  ['morocco'],
  ['mozambique'],
  ['myanmar', 'burma'],
  ['namibia'],
  ['nauru'],
  ['nepal'],
  ['netherlands', 'the netherlands', 'holland'],
  ['new zealand'],
  ['nicaragua'],
  ['niger'],
  ['nigeria'],
  ['north korea', 'dprk', 'democratic people s republic of korea'],
  ['north macedonia', 'macedonia'],
  ['norway'],
  ['oman'],
  ['pakistan'],
  ['palau'],
  ['panama'],
  ['papua new guinea'],
  ['paraguay'],
  ['peru'],
  ['philippines'],
  ['poland'],
  ['portugal'],
  ['qatar'],
  ['romania'],
  ['russia', 'russian federation'],
  ['rwanda'],
  ['saint kitts and nevis'],
  ['saint lucia', 'st lucia'],
  ['saint vincent and the grenadines'],
  ['samoa'],
  ['san marino'],
  ['sao tome and principe'],
  ['saudi arabia'],
  ['senegal'],
  ['serbia'],
  ['seychelles'],
  ['sierra leone'],
  ['singapore'],
  ['slovakia'],
  ['slovenia'],
  ['solomon islands'],
  ['somalia'],
  ['south africa'],
  ['south korea', 'korea', 'republic of korea'],
  ['south sudan'],
  ['spain'],
  ['sri lanka'],
  ['sudan'],
  ['suriname'],
  ['sweden'],
  ['switzerland'],
  ['syria'],
  ['tajikistan'],
  ['tanzania'],
  ['thailand'],
  ['timor leste', 'east timor'],
  ['togo'],
  ['tonga'],
  ['trinidad and tobago'],
  ['tunisia'],
  ['turkey', 'turkiye', 'türkiye'],
  ['turkmenistan'],
  ['tuvalu'],
  ['uganda'],
  ['ukraine'],
  ['united arab emirates', 'uae'],
  [
    'united kingdom',
    'uk',
    'u k',
    'great britain',
    'britain',
    'england',
    'scotland',
    'wales',
    'northern ireland',
  ],
  [
    'united states',
    'usa',
    'u s a',
    'us',
    'u s',
    'united states of america',
    'america',
  ],
  ['uruguay'],
  ['uzbekistan'],
  ['vanuatu'],
  ['venezuela'],
  ['vietnam', 'viet nam'],
  ['yemen'],
  ['zambia'],
  ['zimbabwe'],
  // Not UN members, but places a question can name.
  ['kosovo'],
  ['taiwan'],
  ['hong kong'],
  ['macau', 'macao'],
  ['palestine', 'state of palestine'],
  ['puerto rico'],
  ['vatican city', 'vatican', 'holy see'],
];

// Regions are named by questions but are never a My details country.
export const REGION_TABLE: readonly (readonly string[])[] = [
  ['european union', 'eu', 'e u'],
  ['europe'],
  ['eea', 'european economic area'],
  ['schengen'],
  ['emea'],
  ['apac', 'asia pacific'],
  ['latin america'],
  ['north america'],
  ['south america'],
  ['central america'],
  ['americas', 'the americas'],
  ['asia'],
  ['africa'],
  ['middle east'],
  ['oceania'],
  ['caribbean'],
];

/** Canonical country names, lower case. Regions are not included. */
export const COUNTRY_NAMES: readonly string[] = COUNTRY_TABLE.map(
  (row) => row[0]!,
);

const COUNTRY_BY_ALIAS = new Map<string, string>();
for (const row of COUNTRY_TABLE) {
  for (const alias of row) COUNTRY_BY_ALIAS.set(alias, row[0]!);
}

interface Matcher {
  readonly words: readonly string[];
  readonly length: number;
  readonly canonical: string;
}

// Longest first (more words, then more characters) so a shorter alias cannot
// match inside a longer one, such as "guinea" inside "papua new guinea".
const MATCHERS: readonly Matcher[] = [...COUNTRY_TABLE, ...REGION_TABLE]
  .flatMap((row) =>
    row.map((alias) => ({
      words: alias.split(' '),
      length: alias.length,
      canonical: row[0]!,
    })),
  )
  .sort((a, b) => b.words.length - a.words.length || b.length - a.length);

/** Reads a My details value as a country. The whole text must be one name. */
export function countryOf(text: string): string | undefined {
  return COUNTRY_BY_ALIAS.get(normalizeLabel(text));
}

/**
 * Every country and region a normalised question names, each once, in the
 * order it first appears. Matches whole words and uses each word once.
 */
export function placesNamed(normalizedQuestion: string): string[] {
  if (normalizedQuestion === '') return [];
  const words = normalizedQuestion.split(' ');
  const used = new Array<boolean>(words.length).fill(false);
  const firstSeen = new Map<string, number>();
  for (const matcher of MATCHERS) {
    const size = matcher.words.length;
    for (let start = 0; start + size <= words.length; start++) {
      if (!matcher.words.every((word, i) => words[start + i] === word))
        continue;
      if (used.slice(start, start + size).some(Boolean)) continue;
      used.fill(true, start, start + size);
      const seen = firstSeen.get(matcher.canonical);
      if (seen === undefined || start < seen) {
        firstSeen.set(matcher.canonical, start);
      }
    }
  }
  return [...firstSeen.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([name]) => name);
}
