import type { TemplateField } from '@/lib/template-files';

export const TB_TEMPLATE_SLUG = 'ky-tb-4';
export const PRODUCTION_APP_ORIGIN = 'https://sign.engagess.co';

export const TB_FORM_SOURCE = {
  publisher: 'Kentucky Department for Public Health',
  title: 'Tuberculosis (TB) Risk Assessment',
  formNumber: 'TB-4',
  revision: '3/2014',
  sourceUrl:
    'https://www.chfs.ky.gov/agencies/dph/dehp/idb/Documents/tbtoolkitriskassessment.pdf',
  retrievedOn: '2026-11-17',
} as const;

export const TB_CONSENT_BULLETS = [
  'I hereby authorize the doctors, nurses, or nurse practitioners of the Department for Public Health to administer a Tuberculin Skin Test (TST) or draw blood from me or my child named above for a Blood Assay for Mycobacterium tuberculosis (BAMT) test.',
  'I agree that the results of this test may be shared with other health care providers.',
  'I understand that: this information will be used by health care providers for care and for surveillance /statistical purposes only. This information will be kept confidential.',
] as const;

const PAGE = 792;

function blank(yTop: number, x: number, width: number) {
  return { pageNumber: 1, x, y: round(yTop - 6), width, height: 11 };
}

function mark(baselineFromBottom: number, x = 22.4) {
  const yTop = PAGE - baselineFromBottom;
  return { pageNumber: 1, x, y: round(yTop - 9), width: 12, height: 9 };
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

type TbField = TemplateField & { groupKey: string };

function field(
  fieldName: string,
  label: string,
  fieldType: TemplateField['fieldType'],
  groupKey: string,
  box: {
    pageNumber: number;
    x: number;
    y: number;
    width: number;
    height: number;
  },
  options: { required?: boolean; dateFormat?: string } = {},
): TbField {
  return {
    fieldName,
    label,
    fieldType,
    populatedBy: 'signer',
    signerRole: 'patient',
    required: options.required ?? false,
    groupKey,
    dateFormat: options.dateFormat ?? null,
    ...box,
  };
}

export const TB_FIELDS: TbField[] = [
  field(
    'patient_name',
    'Patient name (L,F,M)',
    'text',
    'demographics',
    blank(70, 119, 193.5),
    { required: true },
  ),
  field('dob', 'DOB', 'date', 'demographics', blank(70, 337, 71), {
    required: true,
    dateFormat: 'MM/DD/YYYY',
  }),
  field('race', 'Race', 'text', 'demographics', blank(70, 434, 20)),
  field('sex', 'Sex', 'text', 'demographics', blank(70, 478.5, 20.5)),
  field('address', 'Address', 'text', 'demographics', blank(87, 66.5, 218.5), {
    required: true,
  }),
  field(
    'city_state_zip',
    'City, State, Zip',
    'text',
    'demographics',
    blank(87, 350, 233.5),
    { required: true },
  ),
  field(
    'home_phone',
    'Home/Work #',
    'phone',
    'demographics',
    blank(104, 92, 121.5),
  ),
  field('cell_phone', 'Cell #', 'phone', 'demographics', blank(104, 235, 81.5)),
  field('language', 'Language', 'text', 'demographics', blank(121, 73, 102)),
  field(
    'country_of_origin',
    'Country of Origin',
    'text',
    'demographics',
    blank(121, 248, 56),
  ),
  field(
    'year_arrived',
    'Year arrived in US',
    'text',
    'demographics',
    blank(121, 383.5, 35.5),
  ),
  field(
    'interpreter_no',
    'Interpreter needed: No',
    'checkbox',
    'demographics',
    mark(792 - 121, 502),
  ),
  field(
    'interpreter_yes',
    'Interpreter needed: Yes',
    'checkbox',
    'demographics',
    mark(792 - 121, 536),
  ),
  field(
    'iia_contact',
    'is a current high risk contact of a person known or suspected to have TB disease.',
    'checkbox',
    'section_2a',
    mark(445.3),
  ),
  field(
    'iia_country',
    'has been in another country for - 3 or more months where TB is common, and has been in the US for < 5 years',
    'checkbox',
    'section_2a',
    mark(423.4),
  ),
  field(
    'iia_congregate',
    'is a resident or an employee of a high TB risk congregate setting',
    'checkbox',
    'section_2a',
    mark(401.6),
  ),
  field(
    'iia_healthcare',
    'is a healthcare worker who serves high-risk patients',
    'checkbox',
    'section_2a',
    mark(389.5),
  ),
  field(
    'iia_underserved',
    'is medically underserved',
    'checkbox',
    'section_2a',
    mark(377.2),
  ),
  field(
    'iia_homeless',
    'has been homeless within the past two years',
    'checkbox',
    'section_2a',
    mark(365.1),
  ),
  field(
    'iia_child',
    'is an infant, a child or an adolescent exposed to an adult(s) in high-risk categories',
    'checkbox',
    'section_2a',
    mark(353),
  ),
  field(
    'iia_drugs',
    'injects illicit drugs or uses crack cocaine',
    'checkbox',
    'section_2a',
    mark(331),
  ),
  field(
    'iia_group',
    'is a member of a group identified by the health department to be at an increased risk for TB infection',
    'checkbox',
    'section_2a',
    mark(318.9),
  ),
  field(
    'iia_screening',
    'needs baseline/annual screening approved by the health department',
    'checkbox',
    'section_2a',
    mark(297.1),
  ),
  field('iib_hiv', 'is HIV positive', 'checkbox', 'section_2b', mark(258.2)),
  field(
    'iib_hiv_unknown',
    'has risk for HIV infection, but HIV status is unknown',
    'checkbox',
    'section_2b',
    mark(246.1),
  ),
  field(
    'iib_recent',
    'was recently infected with Mycobacterium tuberculosis',
    'checkbox',
    'section_2b',
    mark(233.8),
  ),
  field(
    'iib_conditions',
    'has certain clinical conditions, placing them at higher risk for TB disease',
    'checkbox',
    'section_2b',
    mark(221.7),
  ),
  field(
    'iib_conditions_detail',
    'Clinical conditions',
    'text',
    'section_2b',
    blank(581, 78.5, 234),
  ),
  field(
    'iib_drugs',
    'injects illicit drugs (determine HIV status)',
    'checkbox',
    'section_2b',
    mark(202.2),
  ),
  field(
    'iib_drugs_detail',
    'HIV status note',
    'text',
    'section_2b',
    blank(590.5, 215.5, 107.5),
  ),
  field(
    'iib_inadequately_treated',
    'has a history of inadequately treated TB',
    'checkbox',
    'section_2b',
    mark(190.1),
  ),
  field(
    'iib_weight',
    'is >10% below ideal body weight',
    'checkbox',
    'section_2b',
    mark(177.9),
  ),
  field(
    'iib_immunosuppressive',
    'is on immunosuppressive therapy (this includes treatment for rheumatoid arthritis with drugs such as REMICADE, HUMIRA, etc.)',
    'checkbox',
    'section_2b',
    mark(165.7),
  ),
  field(
    'consent_ack',
    'Electronic-signature consent acknowledgment',
    'checkbox',
    'consent',
    mark(137.5, 28),
  ),
  field(
    'signature',
    'Signature',
    'signature',
    'consent',
    { pageNumber: 1, x: 54, y: 704.5, width: 340, height: 28 },
    { required: true },
  ),
  field('signature_date', 'Date', 'date', 'consent', blank(732.5, 438.5, 76), {
    required: true,
    dateFormat: 'MM/DD/YYYY',
  }),
];

export const TB_STEPS = ['info', 'section2', 'review', 'consent'] as const;
export type TbStep = (typeof TB_STEPS)[number];

export function tbFieldsInGroup(group: string) {
  return TB_FIELDS.filter((item) => item.groupKey === group);
}

export function validateTbStep(
  step: TbStep,
  values: Record<string, string>,
  signature?: {
    method: 'typed' | 'drawn';
    typedName: string;
    drawn: boolean;
    legalConsent: boolean;
  },
) {
  const errors: string[] = [];
  if (step === 'info') {
    for (const item of tbFieldsInGroup('demographics').filter(
      (item) => item.required,
    ))
      if (!values[item.fieldName]?.trim())
        errors.push(`${item.label} is required.`);
    const digits =
      `${values.home_phone ?? ''} ${values.cell_phone ?? ''}`.replace(
        /\D/g,
        '',
      );
    if (digits.length < 7)
      errors.push('Enter a home, work, or cell phone number.');
    if (values.interpreter_no === 'yes' && values.interpreter_yes === 'yes')
      errors.push('Choose either No or Yes for interpreter needed.');
  }
  if (step === 'consent') {
    if (values.consent_ack !== 'yes')
      errors.push('Acknowledge the testing authorization before signing.');
    if (!values.signature_date?.trim())
      errors.push('Enter the signature date.');
    if (!signature) errors.push('Add a signature.');
    else if (signature.method === 'typed' && !signature.typedName.trim())
      errors.push('Type your full name as your signature.');
    else if (signature.method === 'drawn' && !signature.drawn)
      errors.push('Draw your signature, or choose typed signature.');
    if (signature && !signature.legalConsent)
      errors.push('Confirm the electronic-signature consent.');
  }
  return errors;
}

export function tbSeedRefusal(
  env: Record<string, string | undefined>,
  args: string[],
) {
  if (!args.includes('--confirm'))
    return 'Pass --confirm to seed the TB-4 template. It never runs automatically.';
  let origin = '';
  try {
    origin = new URL(env.APP_URL ?? '').origin;
  } catch {
    origin = '';
  }
  if (origin === PRODUCTION_APP_ORIGIN)
    return 'Refusing to seed the TB template when APP_URL is the production site.';
  if (env.NODE_ENV === 'production' && env.ENGAGE_ALLOW_TB_SEED !== 'true')
    return 'Set ENGAGE_ALLOW_TB_SEED=true to seed when NODE_ENV=production.';
  return null;
}

export const TB_FICTIONAL_PATIENT = {
  patient_name: 'Test Patient Alpha',
  dob: '1990-01-01',
  race: 'NA',
  sex: 'F',
  address: '100 Example Lane',
  city_state_zip: 'Example City, KY 00000',
  home_phone: '555-010-0100',
  language: 'English',
  country_of_origin: 'USA',
  year_arrived: '1990',
  interpreter_no: 'yes',
  iia_country: 'yes',
  iia_healthcare: 'yes',
  iib_weight: 'yes',
  iib_conditions: 'yes',
  iib_conditions_detail: 'None stated',
  consent_ack: 'yes',
  signature: 'Test Patient Alpha',
  signature_date: '2026-11-17',
  email: 'alpha@example.test',
} as const;
