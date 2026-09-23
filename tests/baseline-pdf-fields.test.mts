import assert from 'node:assert/strict';
import test from 'node:test';

import { baselinePdfFields } from '../lib/baseline-pdf-fields.ts';
import { templateCatalog } from '../lib/template-catalog.ts';

void test('every scanned baseline field has a unique valid box and catalog signer role', () => {
  for (const [slug, fields] of Object.entries(baselinePdfFields)) {
    const catalog = templateCatalog.find((item) => item.id === slug);
    assert.ok(catalog);
    assert.equal(catalog.sourceType, 'pdf');
    assert.ok(fields.length > 0);
    const names = new Set<string>();
    const roles = new Set(catalog.signers.map((signer) => signer.role));
    for (const field of fields) {
      assert.ok(
        !names.has(field.fieldName),
        `${slug}: duplicate ${field.fieldName}`,
      );
      names.add(field.fieldName);
      assert.ok(
        roles.has(field.signerRole),
        `${slug}: invalid ${field.signerRole}`,
      );
      assert.ok(field.pageNumber && field.pageNumber <= catalog.pages);
      assert.ok(
        field.x !== null &&
          field.y !== null &&
          field.width !== null &&
          field.height !== null,
      );
      assert.ok(
        field.x >= 0 && field.y >= 0 && field.width > 0 && field.height > 0,
      );
      assert.ok(
        field.x + field.width <= 1000 && field.y + field.height <= 1000,
      );
    }
    for (const signer of catalog.signers.filter((item) => item.required)) {
      assert.ok(
        fields.some(
          (field) =>
            field.fieldType === 'signature' && field.signerRole === signer.role,
        ),
      );
    }
  }
});
