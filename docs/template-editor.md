# Template editor

Administrators and template managers open `/admin/templates`. A new PDF is uploaded there, or an existing catalog template is opened in the visual editor at `/admin/templates/[versionId]`.

The upload checks the `%PDF-` signature, a 20 MB limit, and 1 to 30 pages, then copies the pages into a new PDF so JavaScript and embedded files are dropped. The file is stored under the private storage root.

The editor shows the PDF with pdf.js. Fields are dragged onto a page, moved, resized, and nudged with the keyboard. Coordinates are PDF points from the top-left of that page. Field types are text, multiline, checkbox, radio, dropdown, signature, initials, date, email, and phone. A properties panel sets the label, required flag, recipient role, choices, and date format. Preview-as-signer hides other roles.

Drafts can be saved and duplicated. Publish is limited to an administrator or a template manager with `can_publish`.
