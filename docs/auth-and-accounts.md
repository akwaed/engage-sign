# Accounts and access

Staff sign in with email and password. Passwords stay on scrypt. The session cookie is `engage_sign_session`, httpOnly, and lasts at most 12 hours. It also ends after `SESSION_IDLE_MINUTES` without a request (default 30). Resetting a password or an administrator revoking sessions invalidates the existing cookies.

## Roles

- `admin` manages users, sees every document, and can publish templates.
- `template_manager` creates and edits templates. Publishing requires `can_publish`.
- `standard_user` sends published templates and sees only their own documents.
- External signers have no account. They open a link.

The first administrator is created at `/setup` only while no user exists and `SETUP_TOKEN` matches. After that the gate stays closed, including on an empty-looking database that already has `setup_completed`.

## Password reset and invites

Forgot-password and admin-sent reset links use a 30-minute single-use token. Only the SHA-256 hash is stored. The response does not say whether the email exists. Login, forgot, reset, and setup are rate-limited per IP and per account in MySQL. The IP is `X-Real-IP`, or the rightmost untrusted hop when `TRUSTED_PROXY` is set, otherwise the socket address. A spoofed `X-Forwarded-For` is not trusted by itself.

## Signer links

`/s/[token]` accepts a 43-character token from a CSPRNG. The database stores only its hash, tied to one signer and envelope. The link expires with the envelope, the recipient session lasts 30 minutes, and the token is invalidated when signing finishes. The recorded verification method is `email_link`. The column can later store `email_otp`; one-time passwords are not implemented. URLs do not contain names, email addresses, or document titles.
