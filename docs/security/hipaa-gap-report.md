# HIPAA readiness gap report

Engage Sign is being prepared to handle healthcare documents later. This software is not HIPAA compliant, and this report does not claim that it is. A signed business associate agreement, a risk analysis, and the administrative safeguards below are organizational duties. Software cannot satisfy them.

## What the software now does

- Access is role-based, sessions are httpOnly, and staff sessions have an idle timeout plus a 12-hour absolute limit.
- Signer links are random, stored only as hashes, bound to one document and recipient, expire, and are invalidated after completion. The verification method recorded today is `email_link`.
- Ordinary email does not include the document title unless `MAIL_INCLUDE_DOCUMENT_TITLE=true`, and it does not attach the PDF.
- Recipient names, emails, field values, and signature metadata are encrypted with AES-256-GCM. Template and final PDFs can be encrypted at rest with `FILE_ENCRYPTION_KEY_V1`.
- The audit log is append-only, hash-chained, and can be checked by an administrator. Completed documents have a downloadable certificate with UTC times, IP, user agent, verification method, and file hashes.
- Uploads are type-checked and rebuilt. Security headers include CSP and HSTS.

## What software alone cannot satisfy

- Business associate agreements with the hosting provider, mail provider, and any other vendor that could see protected health information.
- An organizational risk analysis and risk management plan (45 CFR 164.308(a)(1)).
- Written privacy and security policies, sanction policy, and incident response procedures.
- Workforce training and access authorization decisions for real staff.
- A designated security official and a process for evaluating changes.
- Off-site, tested backups and a restore drill. The application does not back itself up.
- Server hardening: SSH authentication, firewall, fail2ban, patching, and physical or cloud access control. Those were called out as owner-approval operations items and were not changed.
- Facility access, workstation use, and device media controls.
- A determination that the electronic signature is legally sufficient for a particular healthcare document. This application does not guarantee enforceability.
- Minimum-necessary review of which staff may open which patient documents beyond the roles already enforced.
- Breach notification procedures and complaint processes.
- Encryption of backups, database volume encryption, and key custody outside this repository. Keys belong in `/etc/engage-sign-vps/app.env`, not in git.

Using fictional test data in this repository does not make a production deployment ready for real patient information.
