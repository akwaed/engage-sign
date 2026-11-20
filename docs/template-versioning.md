# Template versioning

Each template has versions. A version is `draft`, `active`, or `retired`. Sent envelopes store `template_version_id` and keep that exact version.

Only a draft accepts field, layout, or PDF changes. The API rejects edits to any other lifecycle, and MySQL triggers reject inserts, updates, and deletes of fields on a non-draft version. Changing a published template means duplicating it into a new draft and publishing that draft. The previous active version is retired. Senders choose a published version and enter recipient details. They cannot change the fields for one recipient.

Existing catalog templates and their history are left in place. New PDFs, including the Kentucky TB-4 form, use slug values outside the original nine catalog slugs.
