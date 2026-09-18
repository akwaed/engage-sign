export type SignerPlan = { role: string; order: number; required: boolean };

export type TemplateCatalogItem = {
  id: string;
  name: string;
  sourceFilename: string;
  sourceType: 'docx' | 'pdf';
  sourceHash: string;
  pages: number;
  layoutStrategy: 'docx_merge' | 'pdf_overlay';
  status: 'mapped' | 'needs_content_review';
  signers: SignerPlan[];
  adminFill: string[];
  participantFill: string[];
  notes: string[];
};

export const templateCatalog: TemplateCatalogItem[] = [
  {
    id: 'ca-contractor-agreement',
    name: 'CA Contractor Agreement',
    sourceFilename: 'CA contractor agreement.docx',
    sourceType: 'docx',
    pages: 5,
    layoutStrategy: 'docx_merge',
    status: 'needs_content_review',
    sourceHash:
      '36fda60c6304f9e376d388e082ef8c45f186fdbaf92c02e73bc9c785be2416d6',
    signers: [
      { role: 'contractor', order: 1, required: true },
      { role: 'executive_director', order: 2, required: true },
    ],
    adminFill: [
      'effective_date',
      'contractor_name',
      'contractor_address',
      'hourly_rate',
      'execution_date',
    ],
    participantFill: ['contractor_signature', 'executive_director_signature'],
    notes: [
      'Title reads “Community Assess Specialist”; confirm wording before activation.',
    ],
  },
  {
    id: 'cls-contractual-agreement',
    name: 'CLS Contractual Agreement with Staff',
    sourceFilename: 'CLS Contractual Agreement with Staff.docx',
    sourceType: 'docx',
    pages: 4,
    layoutStrategy: 'docx_merge',
    status: 'mapped',
    sourceHash:
      'cbcdd8681840b3091498b216d02c5c9a8851a9fb43e2f4031148954453dc02d0',
    signers: [
      { role: 'staff_or_subcontractor', order: 1, required: true },
      { role: 'agency_authorized_signer', order: 2, required: true },
    ],
    adminFill: [
      'agreement_date',
      'subcontractor_name',
      'address',
      'start_date',
      'compensation',
    ],
    participantFill: [
      'staff_signature',
      'agency_signature',
      'signer_names',
      'signer_dates',
    ],
    notes: [],
  },
  {
    id: 'competency-skills-checklist',
    name: 'Competency Skills Checklist',
    sourceFilename: 'Competency skills checklist.pdf',
    sourceType: 'pdf',
    pages: 5,
    layoutStrategy: 'pdf_overlay',
    status: 'mapped',
    sourceHash:
      '65eeb594c747d1256f0394c4667931280194cd02c574e818cc6cd6b6b182e41a',
    signers: [
      { role: 'rn_evaluator_primary', order: 1, required: true },
      { role: 'rn_evaluator_additional', order: 1, required: false },
    ],
    adminFill: ['person_observed', 'date_completed'],
    participantFill: [
      'rn_initials',
      'pass_fail_marks',
      'instructor_names',
      'instructor_signatures',
    ],
    notes: [
      'Flat scanned PDF; coordinate overlay is required.',
      'Additional evaluator is optional.',
    ],
  },
  {
    id: 'application-background-authorization',
    name: 'Application and Background Authorization Form',
    sourceFilename:
      'Engage Combined Application and Background Authorization Form.docx',
    sourceType: 'docx',
    pages: 5,
    layoutStrategy: 'docx_merge',
    status: 'mapped',
    sourceHash:
      'c1dfa73283a48a0c6571e7a493133046812d2c26850866a655907209ba846c9d',
    signers: [{ role: 'applicant', order: 1, required: true }],
    adminFill: [],
    participantFill: [
      'application_fields',
      'application_signature',
      'background_authorization_fields',
      'authorization_signature',
    ],
    notes: [
      'Contains SSN, date of birth, and identity data; field-level encryption is mandatory.',
    ],
  },
  {
    id: 'fhp-contractor-agreement',
    name: 'FHP Contractor Agreement',
    sourceFilename: 'FHP contractor agreement updated 2024.docx',
    sourceType: 'docx',
    pages: 4,
    layoutStrategy: 'docx_merge',
    status: 'needs_content_review',
    sourceHash:
      '4bd7518da7be2d0a7b6fa3e4d9c1e438b1ee54c36fb579b2b3ece33cf952c4ab',
    signers: [
      { role: 'contractor', order: 1, required: true },
      { role: 'executive_director', order: 2, required: true },
    ],
    adminFill: [
      'agreement_date',
      'contractor_name',
      'contractor_address',
      'compensation',
    ],
    participantFill: ['contractor_signature', 'executive_director_signature'],
    notes: [
      'Compensation text shows “One Hundred and Ten Dollars ($130.00)”.',
      'Section 3.3 appears twice.',
    ],
  },
  {
    id: 'med-admin-policies',
    name: 'Medication Administration Policies',
    sourceFilename: 'Med admin policies.pdf',
    sourceType: 'pdf',
    pages: 1,
    layoutStrategy: 'pdf_overlay',
    status: 'mapped',
    sourceHash:
      '6c0c6565ec452c021845fc2d791b79248f741a228b2557eb29c81fe9412376b7',
    signers: [
      { role: 'staff_participant', order: 1, required: true },
      { role: 'rn_trainer', order: 2, required: true },
    ],
    adminFill: ['participant_name', 'agency_name'],
    participantFill: [
      'participant_signature',
      'participant_date',
      'rn_signature',
    ],
    notes: ['Flat scanned PDF; coordinate overlay is required.'],
  },
  {
    id: 'med-training-completion',
    name: 'Medication Training Completion',
    sourceFilename: 'Med training completion.pdf',
    sourceType: 'pdf',
    pages: 1,
    layoutStrategy: 'pdf_overlay',
    status: 'mapped',
    sourceHash:
      '6684c8a511781ab2f4ebf4e8321b023c0bde33df87578604b5f20d2fbe1b80bc',
    signers: [
      { role: 'non_licensed_staff', order: 1, required: true },
      { role: 'rn_trainer', order: 2, required: true },
    ],
    adminFill: ['participant_name', 'training_date'],
    participantFill: ['staff_signature', 'staff_date', 'rn_signature'],
    notes: ['Flat scanned PDF; coordinate overlay is required.'],
  },
  {
    id: 'medication-refresher-training',
    name: 'Medication Administration Refresher Training',
    sourceFilename: 'Medication Administration Refresher training..docx',
    sourceType: 'docx',
    pages: 3,
    layoutStrategy: 'docx_merge',
    status: 'mapped',
    sourceHash:
      'dc4dc6ebdeed9734fe9668579eede19464b0a73bf4c5220e9aa5e2b941c6224e',
    signers: [
      { role: 'employee', order: 1, required: true },
      { role: 'trainer_evaluator', order: 2, required: true },
    ],
    adminFill: [
      'employee_name',
      'employee_title',
      'trainer_name',
      'trainer_credentials',
    ],
    participantFill: [
      'employee_signature',
      'employee_date',
      'trainer_signature',
      'trainer_date',
    ],
    notes: [],
  },
  {
    id: 'memorandum-of-understanding',
    name: 'Memorandum of Understanding',
    sourceFilename: 'Memorandum of Understanding.docx',
    sourceType: 'docx',
    pages: 1,
    layoutStrategy: 'docx_merge',
    status: 'mapped',
    sourceHash:
      '0e490175f64d43a19d04065ba5fd238fd35816d6cadcb8631368548d3c1c8a78',
    signers: [
      { role: 'executive_director', order: 1, required: true },
      { role: 'authorizing_agent', order: 2, required: true },
    ],
    adminFill: ['organization_name', 'organization_address', 'effective_date'],
    participantFill: [
      'executive_director_signature',
      'authorizing_agent_signature',
      'signer_dates',
    ],
    notes: [],
  },
];
