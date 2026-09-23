import type { TemplateField } from '@/lib/template-files';

const PAGE_WIDTH = 935;
const PAGE_HEIGHT = 1210;

type FieldInput = Omit<
  TemplateField,
  'pageNumber' | 'x' | 'y' | 'width' | 'height'
>;

function box(
  pageNumber: number,
  x: number,
  y: number,
  width: number,
  height: number,
  input: FieldInput,
): TemplateField {
  return {
    ...input,
    pageNumber,
    x: Math.round((x / PAGE_WIDTH) * 1000),
    y: Math.round((y / PAGE_HEIGHT) * 1000),
    width: Math.round((width / PAGE_WIDTH) * 1000),
    height: Math.round((height / PAGE_HEIGHT) * 1000),
  };
}

function field(
  page: number,
  x: number,
  y: number,
  width: number,
  height: number,
  fieldName: string,
  label: string,
  fieldType: TemplateField['fieldType'],
  populatedBy: TemplateField['populatedBy'],
  signerRole: string,
  required = true,
) {
  return box(page, x, y, width, height, {
    fieldName,
    label,
    fieldType,
    populatedBy,
    signerRole,
    required,
  });
}

const medicationPolicies: TemplateField[] = [
  field(
    1,
    136,
    226,
    465,
    30,
    'participant_name',
    'Non-licensed staff name',
    'text',
    'admin-fill',
    'staff_participant',
  ),
  field(
    1,
    112,
    288,
    263,
    29,
    'agency_name',
    'Employing agency',
    'text',
    'admin-fill',
    'staff_participant',
  ),
  field(
    1,
    113,
    704,
    266,
    32,
    'participant_signature',
    'Non-licensed staff signature',
    'signature',
    'signer',
    'staff_participant',
  ),
  field(
    1,
    113,
    777,
    266,
    32,
    'participant_date',
    'Staff signing date',
    'date',
    'signer',
    'staff_participant',
  ),
  field(
    1,
    113,
    839,
    266,
    32,
    'rn_signature',
    'RN direct trainer signature',
    'signature',
    'signer',
    'rn_trainer',
  ),
];

const medicationCompletion: TemplateField[] = [
  field(
    1,
    113,
    586,
    315,
    32,
    'staff_signature',
    'Non-licensed staff signature',
    'signature',
    'signer',
    'non_licensed_staff',
  ),
  field(
    1,
    113,
    653,
    315,
    32,
    'staff_date',
    'Staff signing date',
    'date',
    'signer',
    'non_licensed_staff',
  ),
  field(
    1,
    113,
    719,
    315,
    32,
    'rn_signature',
    'RN direct trainer signature',
    'signature',
    'signer',
    'rn_trainer',
  ),
];

const competency: TemplateField[] = [];
const primary = 'rn_evaluator_primary';
const additional = 'rn_evaluator_additional';

for (const [page, header] of [
  [1, { observedY: 232, observerY: 318, observerSecondY: 363 }],
  [4, { observedY: 193, observerY: 279, observerSecondY: 325 }],
  [5, { observedY: 232, observerY: 318, observerSecondY: 363 }],
] as const) {
  competency.push(
    field(
      page,
      265,
      header.observedY,
      195,
      29,
      `p${page}_person_observed`,
      'Person observed',
      'text',
      'admin-fill',
      primary,
    ),
    field(
      page,
      608,
      header.observedY,
      157,
      29,
      `p${page}_date_completed`,
      'Date completed',
      'date',
      'admin-fill',
      primary,
    ),
    field(
      page,
      112,
      header.observerY,
      314,
      29,
      `p${page}_evaluator_name`,
      'Primary evaluator printed name and title',
      'text',
      'signer',
      primary,
    ),
    field(
      page,
      450,
      header.observerY,
      142,
      29,
      `p${page}_evaluator_signature`,
      'Primary evaluator signature',
      'signature',
      'signer',
      primary,
    ),
    field(
      page,
      685,
      header.observerY,
      85,
      29,
      `p${page}_evaluator_date`,
      'Primary evaluator date',
      'date',
      'signer',
      primary,
    ),
    field(
      page,
      112,
      header.observerSecondY,
      314,
      29,
      `p${page}_additional_name`,
      'Additional evaluator printed name and title',
      'text',
      'signer',
      additional,
      false,
    ),
    field(
      page,
      450,
      header.observerSecondY,
      142,
      29,
      `p${page}_additional_signature`,
      'Additional evaluator signature',
      'signature',
      'signer',
      additional,
      false,
    ),
    field(
      page,
      685,
      header.observerSecondY,
      85,
      29,
      `p${page}_additional_date`,
      'Additional evaluator date',
      'date',
      'signer',
      additional,
      false,
    ),
  );
}

const rows: Array<{
  page: number;
  top: number;
  bottom: number;
  labels: string[];
  columns: [number, number, number];
}> = [
  {
    page: 1,
    top: 752,
    bottom: 1091,
    columns: [330, 445, 560],
    labels: [
      'Hand washing and infection control',
      'Appropriate equipment',
      'Medication administration record',
      'Medication label and MAR',
      'Medication order components',
    ],
  },
  {
    page: 2,
    top: 245,
    bottom: 1128,
    columns: [330, 445, 560],
    labels: [
      'Six rights of medication administration',
      'Clean technique',
      'Fluids offered',
      'Observed swallowing',
      'Monitored reactions',
      'Initialed MAR',
      'Documented refused or held medications',
    ],
  },
  {
    page: 3,
    top: 245,
    bottom: 489,
    columns: [330, 445, 560],
    labels: [
      'PRN medications',
      'Other agency forms',
      'Client record note',
      'Medication return to storage',
    ],
  },
  {
    page: 4,
    top: 580,
    bottom: 1060,
    columns: [343, 467, 585],
    labels: [
      'Oral tablets and capsules',
      'Liquid medication measurement',
      'Sublingual medications',
      'Eye drops',
      'Ear drops',
      'Nasal inhaler',
      'Nasal sprays',
      'Topical ointment',
      'Rectal suppository',
      'Oral temperature',
      'Respiration',
      'Pulse',
      'Blood pressure',
    ],
  },
  {
    page: 5,
    top: 697,
    bottom: 969,
    columns: [343, 467, 585],
    labels: [
      'Vaginal cream or suppository',
      'Metered dose inhaler',
      'Spacer device',
      'Epi-pen',
      'Medication error response',
    ],
  },
];

// These row edges follow the original 2017 scanned pages at 110 DPI. They are
// reviewed as draft overlays and remain editable before activation.
const rowEdges: Record<number, number[]> = {
  1: [752, 821, 866, 933, 1023, 1091],
  2: [245, 421, 509, 598, 687, 842, 1017, 1128],
  3: [245, 311, 377, 444, 489],
  4: [580, 603, 783, 806, 829, 852, 875, 899, 944, 967, 991, 1014, 1037, 1060],
  5: [697, 743, 788, 856, 879, 969],
};

for (const section of rows) {
  const edges = rowEdges[section.page];
  section.labels.forEach((label, index) => {
    const top = edges[index] + 2;
    const height = Math.min(28, edges[index + 1] - top - 2);
    const stem = `p${section.page}_skill_${index + 1}`;
    competency.push(
      field(
        section.page,
        section.columns[0] + 7,
        top,
        section.columns[1] - section.columns[0] - 14,
        height,
        `${stem}_yes_initials`,
        `${label}: yes RN initials`,
        'initials',
        'signer',
        primary,
        false,
      ),
      field(
        section.page,
        section.columns[1] + 7,
        top,
        section.columns[2] - section.columns[1] - 14,
        height,
        `${stem}_no_initials`,
        `${label}: no RN initials`,
        'initials',
        'signer',
        primary,
        false,
      ),
      field(
        section.page,
        section.columns[2] + 5,
        top,
        810 - section.columns[2] - 10,
        height,
        `${stem}_comments`,
        `${label}: observation or comments`,
        'text',
        'signer',
        primary,
        false,
      ),
    );
  });
}

for (const [page, y] of [
  [3, 546],
  [4, 1075],
  [5, 1010],
]) {
  competency.push(
    field(
      page,
      263,
      y,
      50,
      27,
      `p${page}_pass_yes`,
      'Pass with 100 percent: yes',
      'checkbox',
      'signer',
      primary,
      false,
    ),
    field(
      page,
      337,
      y,
      47,
      27,
      `p${page}_pass_no`,
      'Pass with 100 percent: no',
      'checkbox',
      'signer',
      primary,
      false,
    ),
    field(
      page,
      536,
      y,
      215,
      29,
      `p${page}_pass_signature`,
      'Instructor pass signature',
      'signature',
      'signer',
      primary,
    ),
  );
}

export const baselinePdfFields: Record<string, TemplateField[]> = {
  'med-admin-policies': medicationPolicies,
  'med-training-completion': medicationCompletion,
  'competency-skills-checklist': competency,
};
