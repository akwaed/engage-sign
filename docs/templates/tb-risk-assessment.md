# Kentucky TB Risk Assessment (TB-4)

## Source

The blank file in `fixtures/templates/ky-dph-tb-4.pdf` is the public form published by the Kentucky Department for Public Health.

- Title: Tuberculosis (TB) Risk Assessment
- Form number and revision: TB-4 (3/2014)
- Source URL: https://www.chfs.ky.gov/agencies/dph/dehp/idb/Documents/tbtoolkitriskassessment.pdf
- Retrieved: 2026-11-17

The signed scan that was used only to identify which form this is was not copied into the repository. No handwritten names, dates, or signatures from that scan are stored here. Page 2 of the official PDF is the publisher's CDC reference note and has no fields.

## What the patient can fill

Interactive fields are only:

- Demographics and contact at the top: name, date of birth, race, sex, address, city/state/ZIP, home/work phone, cell phone, language, country of origin, year arrived in the US, and interpreter needed (No or Yes).
- Every Section II-A and Section II-B checkbox, independently. The two short blanks on the clinical-conditions and HIV-status lines are optional notes.
- The testing-authorization acknowledgment, a drawn or typed signature, and the signature date.

Social Security number, pregnancy, allergies, medications, Section I symptoms, BCG/TST history, Sections III and IV, and the screener block stay printed and non-interactive. The form does not score answers and does not suggest a diagnosis.

## How it is installed

The template is not created by application startup or by the jobs timer. On a non-production `APP_URL`, an operator runs:

```bash
npm run seed:tb -- --confirm
```

The script inserts version 1 as a draft, writes the fields, then publishes that version through the same lifecycle change the template editor uses. Published fields stay immutable. A second run finds slug `ky-tb-4` and does nothing. It refuses `APP_URL=https://sign.engagess.co`. When `NODE_ENV=production` on any other host, it also requires `ENGAGE_ALLOW_TB_SEED=true`.

Apply migration `007_signing_verification.sql` before the build that records `verification_method`. Signers still open a hashed, single-use link bound to the document and recipient. The recorded method is `email_link`. The column can later store `email_otp` without another table change; one-time passwords are not implemented.

## Patient steps

The invitation link opens a four-step page: information, Section II, review, then consent and signature. Required checks are the name, date of birth, address, city/state/ZIP, at least one phone number, the authorization acknowledgment, the signature, the date, and the electronic-signature consent. Section II may be left entirely blank.
