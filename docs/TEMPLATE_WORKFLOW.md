# Template import and version workflow

The template workspace is `/admin/templates` and requires an administrator session. The nine catalog entries in `lib/template-catalog.ts` define expected filenames, original SHA-256 hashes, page counts, and signer roles. Source files are never served from `public/`.

## Prepare the environment

1. On an existing MySQL installation, apply `database/mysql/migrations/001_template_lifecycle.sql` once. New installations receive the same columns from `database/mysql/schema.sql`.
2. On GoDaddy, set Preview `PRIVATE_STORAGE_PATH=/private/engage-sign`. GoDaddy's File Manager describes `/private` as durable across deploys and never publicly served. On other hosts, use an absolute persistent directory **outside the application directory and public web root**. The Node process must be able to create directories and files there. Back it up with MySQL. Template files are created with private permissions where the filesystem supports them.
3. For Word rendering, install LibreOffice on the application host and set `LIBREOFFICE_BIN` to the absolute path of its `soffice` executable. If GoDaddy does not permit this binary, use an approved isolated conversion service before enabling DOCX previews. Do not send participant data to a third-party converter without approval.

To prepare Word drafts locally, run `python scripts/prepare-word-templates.py "../engage docs" work/revised`. The script verifies the six baseline hashes before editing, keeps the baselines untouched, and writes revised DOCX files and role-assigned `*.fields.json` maps to the ignored `work/revised/` directory. It preserves existing legal wording. The CA and FHP text still requires content review. The application/background form contains sensitive fields, so keep completed test fills out of Git.

## Import and map

1. Select a catalog entry and upload its exact original file as **Exact baseline**. The server checks file type, size, structure, SHA-256, and the stored copy. The first version must match the catalog hash. It remains a draft.
2. For DOCX, upload a generated or reviewed copy with literal, contiguous `{{field_name}}` placeholders as **New revision**. Import its corresponding `*.fields.json` in the field-map editor, review every field, and save. The document text and pagination must be reviewed separately before activation.
3. Exact-baseline scanned PDFs load draft field maps automatically. Review each box, type, owner, and signer role; click its top-left corner and adjust width and height as needed. Coordinates are normalized to a 0–1000 grid and do not depend on browser zoom.
4. Map every signature, initials, date, checkbox, radio, and text input. Activation requires a signature for every required signer role. The administrator must visually inspect every box, page, and signer assignment before activation.
5. Save the map, enter sample values under **Test fill**, and inspect the resulting PDF. Activation freezes the map and automatically retires the previously active version. Retired versions remain available for rollback; existing envelopes continue referring to their original version.

The CA and FHP agreements remain blocked on content review noted in the catalog. No real signing should start until the release gate in the README is complete.
