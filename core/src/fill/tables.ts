import type { ProfileKey } from '../profile';

export interface RecognitionTables {
  profileAutocomplete: ReadonlyMap<string, ProfileKey>;
  profilePhrases: ReadonlyMap<ProfileKey, readonly string[]>;
  /** Answer key to phrases, in the order of DEFAULT_ANSWERS. */
  answerPhrases: ReadonlyMap<string, readonly string[]>;
}

/** Phrases are stored in the form normalizeLabel produces. */
export const DEFAULT_TABLES: RecognitionTables = {
  profileAutocomplete: new Map<string, ProfileKey>([
    ['name', 'full_name'],
    ['given-name', 'first_name'],
    ['family-name', 'last_name'],
    ['email', 'email'],
    ['tel', 'phone'],
    ['tel-national', 'phone'],
    ['address-line1', 'address_line1'],
    ['address-line2', 'address_line2'],
    ['address-level2', 'city'],
    ['address-level1', 'region'],
    ['postal-code', 'postal_code'],
    ['country-name', 'country'],
  ]),
  profilePhrases: new Map<ProfileKey, readonly string[]>([
    ['full_name', ['name', 'full name', 'your name', 'legal name']],
    ['first_name', ['first name', 'given name']],
    ['last_name', ['last name', 'surname', 'family name']],
    ['email', ['email', 'email address', 'e mail']],
    [
      'phone',
      ['phone', 'phone number', 'mobile', 'mobile number', 'telephone'],
    ],
    ['address_line1', ['address', 'street address', 'address line 1']],
    ['address_line2', ['address line 2']],
    ['city', ['city']],
    ['region', ['state', 'province', 'region', 'state or province']],
    ['postal_code', ['zip', 'zip code', 'postal code', 'postcode']],
    ['country', ['country']],
    ['linkedin', ['linkedin', 'linkedin url', 'linkedin profile']],
    ['github', ['github', 'github url', 'github profile']],
    [
      'website',
      [
        'website',
        'personal website',
        'portfolio',
        'portfolio url',
        'other website',
        'other website url',
      ],
    ],
  ]),
  answerPhrases: new Map<string, readonly string[]>([
    [
      'work_authorization',
      [
        'authorized to work',
        'authorised to work',
        'eligible to work',
        'legally authorized',
        'legally authorised',
        'right to work',
      ],
    ],
    [
      'sponsorship',
      [
        'require sponsorship',
        'need sponsorship',
        'visa sponsorship',
        'sponsorship for employment',
        'immigration sponsorship',
      ],
    ],
    ['salary_range', ['salary', 'compensation', 'expected pay', 'desired pay']],
    [
      'earliest_start_date',
      [
        'start date',
        'available to start',
        'when can you start',
        'earliest start',
      ],
    ],
    [
      'relocation',
      [
        'willing to relocate',
        'open to relocating',
        'open to relocation',
        'able to relocate',
      ],
    ],
    ['reason_for_leaving', ['reason for leaving', 'why are you leaving']],
  ]),
};
