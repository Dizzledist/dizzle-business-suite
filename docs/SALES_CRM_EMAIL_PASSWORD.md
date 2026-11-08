# Sales CRM email and password sign-in

The isolated password branch starts at the shared authentication foundation and uses the existing CRM user IDs, organization and team permissions, session store, and Zoho salesperson mappings. The separate Google OIDC branch remains available for future review. Browser-accessible invoice reporting uses synthetic data.

## Start the local pilot

Use Node 24 and the password feature worktree. The existing development defaults are 5173 for the web app and 3001 for the API. Use 5384 and 3384 for an isolated pilot alongside the earlier previews.

```powershell
$env:NODE_ENV = 'development'
$env:SALES_CRM_ENABLED = 'true'
$env:SALES_CRM_AUTH_ENABLED = 'true'
$env:SALES_CRM_PASSWORD_ENABLED = 'true'
$env:ZOHO_ENABLED = 'false'
$env:DIZZLE_WEB_PORT = '5384'
$env:DIZZLE_API_PORT = '3384'
npm run dev
```

Open [the local Sales CRM](http://127.0.0.1:5384/sales). The browser Host survives the Vite proxy and password requests require the exact same Origin. The original read-only Zoho operator service continues to use its own checkout and configuration.

## Establish the first administrator

1. A trusted local operator independently verifies the administrator's company email. In a separate interactive PowerShell terminal in this feature worktree, set development mode and the three Sales CRM flags above. Run:

   ```powershell
   node --import tsx scripts/bootstrap-password-admin.ts
   ```

2. Enter the CRM organization ID, approved name and verified company email. Use `demo-o1` to review the seeded synthetic organization. Type **APPROVE** to create a pending administrator and receive the private one-time setup code.
3. Open **Use Setup or Reset Code** on the sign-in screen. Enter the approved email and code, choose a unique password, then use **Sign In**. The setup code expires after 24 hours and is consumed upon success. The bootstrap command can replace an unclaimed initial code for the same account and organization.
4. If the sole enrolled active administrator needs recovery, the trusted local operator can run the same command with `--recover`. Verify the exact organization and company email, then type **RECOVER**. The command issues an audited reset code for that existing account. Its password and sessions change only when the administrator claims the code.

## Employee setup and password recovery

An authenticated administrator can open **User management**, add a named employee with the independently verified company email, and assign the role and team. The app starts the new account as pending and displays a setup code once. Share it through a trusted private channel after independently verifying the recipient. The employee chooses their password and becomes active when setup succeeds.

To enroll an existing approved user, select their record and issue a setup code. The existing CRM user ID, role, team and Zoho salesperson mapping are retained. A password login email is unique across the local identity store. The directory displays credential readiness, disabled status, pending reset requests and recent access activity. Admins can update role, department, team and status, issue replacement codes, and revoke sessions.

**Forgot Password** submits a generic request and flags an eligible account in the administrator directory. An administrator independently verifies the employee, issues a 30-minute reset code, and shares it privately. The employee uses **Use Setup or Reset Code** to choose a new password. Replacement codes invalidate earlier ones. Setup and reset codes are single-use, bound to the employee email, and stored only as digests. Password recovery revokes all active sessions. Automatic email delivery is pending an approved delivery provider and operational policy.

An authenticated employee changes their password in **Account settings** using the current password. A successful change invalidates active sessions and prompts a new sign-in.

## Storage and safeguards

| Additive storage | Purpose |
| --- | --- |
| `sales_password_credentials` | User reference, unique normalized login email, salted Argon2id digest and change timestamp |
| `sales_password_actions` | Digest, purpose and expiration of the current one-time code per user |
| `sales_password_reset_requests` | Pending request timestamp for an eligible user |
| `sales_password_rate_limits` | Durable attempt counters and expiry by action and normalized email digest, plus a shared loopback limit |
| `sales_sessions.password_authenticated` | Marks the existing session format as password-authenticated, keeping earlier fixture-issued sessions outside password mode |

The server hashes passwords with the maintained `argon2` package using Argon2id at 19,456 KiB, two iterations and parallelism one. Passwords allow 15–128 Unicode characters, use NFC normalization, and reject known weak examples, obvious patterns and an exact email-local-part match. The blocklist is intentionally local and small. Production should review a larger vetted compromised-password corpus. Unknown and disabled accounts run dummy Argon2id verification and receive the same response as an incorrect password. Login permits five attempts per normalized email per 15-minute window, with a shared limit of 120. The server applies separate limits to setup and reset endpoints and caps concurrent Argon2 work. [NIST password requirements](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/) · [OWASP Argon2id guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

The existing host-only Secure, HttpOnly, SameSite=Lax cookie and 30-minute idle and eight-hour absolute session lifetimes apply. Session mutations require same-origin and CSRF checks. Role, team and status changes revoke sessions. The server continues to scope synthetic financial reports by the signed-in user's role, tenant, team and credited salesperson. Demo identities cannot use session-only routes. Password hashes and codes stay outside browser asset serving and Git. Setup and reset codes are visible only when issued to an authorized local operator or administrator. The separate credential table allows future verified provider linking without changing CRM account IDs.

This branch uses a loopback development runtime. Production needs reviewed HTTPS hosting and database migration, an approved email or recovery policy, and a real user pilot before acceptance. The first-email evidence gate still applies to live reporting.
