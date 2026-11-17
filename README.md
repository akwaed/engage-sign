# Engage Sign VPS

Separate VPS migration workspace for Engage Sign, targeting **2 vCPU, 4 GB RAM, and 40 GB NVMe**.

Start with [the VPS migration and build checklist](docs/VPS_MIGRATION.md). It is the current plan for infrastructure, application gaps, data transfer, testing, and cutover. The VPS has not been provisioned or deployed by this change.

The existing Next.js/Node application, MySQL schema, signing workflows, private storage, encryption, mail adapter, and evidence exports are the starting point. We are rebuilding hosting and operations around them.

## Workspace identity

- Local directory and npm package: `engage-sign-vps`.
- Migration branch: `codex/vps-migration`.
- Cloned from local `engage-sign` at commit `4c81f9d`, with the two existing uncommitted mail edits copied across.
- `source-local` points to the original local repository. No GitHub repository was created and no changes were pushed. Add a separate VPS repository as `origin` when ready.
- Dependencies, runtime secrets, hosted database contents, and private document storage are not included in the clone.

## Local development

```bash
npm ci
# Configure .env.local from .env.example with development-only credentials.
npm run dev
```

Use an isolated MySQL database and private storage directory outside the checkout. Follow the database inventory step in the migration checklist before importing schema or applying migrations.

Validation commands: `npm test`, `npm run lint`, and `npm run build`. Build Linux release artifacts in Linux CI for the target architecture.

## Reference material

- [Existing feature inventory and historical checklist](docs/IMPLEMENTATION_BASELINE.md)
- [Template workflow](docs/TEMPLATE_WORKFLOW.md)
- [Signing workflow](docs/SIGNING_WORKFLOW.md)
- [MySQL schema and migrations](database/mysql/README.md)
- [Previous GoDaddy deployment](docs/GODADDY_DEPLOYMENT.md)

GoDaddy and Sites deployment instructions in historical documents describe the earlier environments. The VPS checklist supersedes their hosting steps. Existing legal, template-approval, and production release gates still apply.
