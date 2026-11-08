# Secure local Zoho Inventory OAuth

## Status

Prompt #5 adds a disabled-by-default, loopback-only OAuth connection for organization 821729823. The branch builds on the read-only reporting adapter at 9c336ea. The current CRM identities are public fixtures. Management therefore requires the existing active admin fixture and a distinct local operator key on direct localhost requests. The Settings page remains a placeholder until a real administrator session can guard it. The backend supplies status, reconnect and a bounded sample without returning provider credentials or records.

The working demo remains on its original checkout. This branch used mocks only. Rotate the exposed client secret in Zoho's API Console before using these steps.

## Configuration and authorization

1. Confirm the Zoho Console client is a **Server-based Application**. Regenerate the exposed secret and register this exact authorized redirect URI:

   ~~~text
   http://localhost:3001/api/integrations/zoho/callback
   ~~~

   Port 3001 is the existing API and serves the callback directly. The Vite UI uses port 5173. Keep the same host spelling for the authorization steps. Use the account's actual data center from the Console or signed-in Accounts URL. The documented US pair is Accounts at https://accounts.zoho.com and Inventory at https://www.zohoapis.com/inventory/v1. Use that pair only if the account and client are US. The implementation accepts known matching US, EU, India, Australia, Japan, Canada and Saudi Arabia pairs. The organization number alone does not establish its data center. [Zoho client registration](https://www.zoho.com/developer/oauth/register-app.html) · [Accounts data centers](https://www.zoho.com/developer/oauth/multi-dc-support.html) · [Inventory regions](https://www.zoho.com/inventory/api/v1/introduction/)
2. Copy [.env.example](../.env.example) into a private **server-only** environment file outside the checkout, using a directory restricted to your OS account. Set SALES_CRM_ENABLED and ZOHO_ENABLED to true, ZOHO_ORGANIZATION_ID to 821729823, ZOHO_REDIRECT_URI to the exact callback, and the matching ZOHO_ACCOUNTS_URL and ZOHO_API_BASE_URL. Enter ZOHO_CLIENT_ID and the newly rotated ZOHO_CLIENT_SECRET privately. Set ZOHO_LOCAL_ADMIN_KEY and ZOHO_TOKEN_ENCRYPTION_KEY to independent random 32-byte values encoded as 64 hex characters. Write the generated keys directly into the private file without printing them. Set ZOHO_TOKEN_STORE_PATH to an absolute file path in an existing private directory outside the checkout. Keep the environment file out of source control and out of the web server. Git ignores .env and .env.* except the example.
3. During the approved local connection session, run the API from this branch in its own terminal. If the existing demo occupies port 3001, stop that development instance before starting this one. Substitute your private server environment path:

   ~~~powershell
   node --env-file="C:\path\to\private\zoho.env" --import tsx server/index.ts
   ~~~

   The authorization flow uses this backend directly and can run without Vite. To view the local CRM too, run npm run dev:web in a separate terminal with SALES_CRM_ENABLED enabled and without loading the server credentials. Both runtime ports bind loopback.
4. After the owner explicitly approves the connection, use PowerShell 7 in a separate local terminal to request a one-use browser start link. Enter the local operator key in the masked prompt. The browser opens Zoho Accounts for your own sign-in and consent. The callback checks that the grant can read the target organization's metadata.

   ~~~powershell
   $zohoManagement = 'http://localhost:3001/api/integrations/zoho'
   $zohoAdminHeaders = @{
     'X-Demo-Identity' = 'admin'
     'X-Zoho-Local-Admin-Key' = (Read-Host 'Local Zoho operator key' -MaskInput)
   }
   $zohoStart = Invoke-RestMethod -NoProxy -Method Post -Uri "$zohoManagement/authorize" -Headers $zohoAdminHeaders
   Start-Process -FilePath $zohoStart.startUrl
   Invoke-RestMethod -NoProxy -Uri "$zohoManagement/status" -Headers $zohoAdminHeaders
   ~~~

   Run status again after the browser finishes. Reconnect uses the same authorize flow. A rejected reconnect preserves the previously stored grant. Loading the server or reading status does not send a provider request.
5. After separate approval for the bounded data read, issue this local command:

   ~~~powershell
   Invoke-RestMethod -NoProxy -Method Post -Uri "$zohoManagement/sample" -Headers $zohoAdminHeaders
   ~~~

   It reads up to one invoice, customer and item plus one invoice detail for in-memory reconciliation, then discards record payloads. It returns counts and updates the successful connection and sample timestamps. Retry the same command after a recoverable read failure. The command has no input parameters, background schedule, historical scan or writeback. To check the live pilot, review the mock method evidence and compare Zoho's Activity Logs before and after the approved sample using existing authorized Zoho UI access.

## Security and route boundaries

- The fixed scope string is ZohoInventory.invoices.READ,ZohoInventory.contacts.READ,ZohoInventory.items.READ,ZohoInventory.settings.READ. Returned scopes, when supplied by Zoho, must match that set. The only external POST target is the configured Zoho Accounts /oauth/v2/token endpoint for authorization-code exchange or refresh. Zoho Inventory transport always uses GET and a fixed allowlist. It denies redirects and accepts only numeric resource IDs and bounded internal pagination. The local management API provides no resource proxy. [Inventory scopes](https://www.zoho.com/inventory/api/v1/oauth/) · [Accounts server OAuth](https://www.zoho.com/developer/oauth/web-server-apps/overview.html)
- A one-time expiring operator ticket establishes a browser-bound state and S256 PKCE challenge. The HttpOnly SameSite=Lax cookie is scoped to the localhost management path. The callback validates state, browser binding, redirect host and regional hints before exchanging the code. Valid callback state is consumed before exchange. Success redirects to a fixed URL without the code. HTTP loopback is the sole runtime boundary for this development flow. [Zoho Accounts authorization](https://www.zoho.com/developer/oauth/web-server-apps/get-authorization-code.html)
- Only the refresh grant is persisted, using AES-256-GCM with a random nonce, authenticated context for client/region/org/scopes, and atomic replacement outside the checkout. The store refuses to replace an unrelated file or a grant encrypted for a different configuration. The server stores the access token in memory and refreshes on expiry or one retry after 401. Provider errors are redacted. Status returns mode, organization, last successful connection and sample times, and an error category. Those timestamps are process-local and a restart reports authorization saved until the next approved read.
- The local GET status and local POST authorize/sample require both an active fixture admin and the separate operator key, accept no caller-provided URLs or IDs, and reject browser-origin admin commands. Start and callback use their short-lived one-time state instead of the operator key. The existing application access and warehouse workflow are unchanged.

| Inventory method | Path under /inventory/v1 |
|---|---|
| GET | /organizations |
| GET | /contacts and /contacts/{contact_id}, restricted to customer records |
| GET | /items and /items/{item_id} |
| GET | /invoices and /invoices/{invoice_id} |
| GET | /invoices/{invoice_id}/payments and /invoices/{invoice_id}/comments |

The organization list read verifies the approved ID. All other requests include the configured organization ID. The one-off sample reuses bounded reader and sync code. The previously tested wider reconciliation prototype stays unwired to this management flow. [Organizations](https://www.zoho.com/inventory/api/v1/organizations/) · [Contacts](https://www.zoho.com/inventory/api/v1/contacts/) · [Items](https://www.zoho.com/inventory/api/v1/items/) · [Invoices](https://www.zoho.com/inventory/api/v1/invoices/)

## Invoice reporting remains gated

Zoho exposes invoice creation and invoice dates, current status, an emailed flag and dated comments/history. The documented comments schema does not guarantee a first successful email event, timestamp offset, retention or coverage across manual, bulk and automated sends. System Mails and Activity Logs are evidence candidates. Reconcile existing authorized historical events or a sanitized source export to exact invoice IDs and attributable revisions. Keep rows with missing or ambiguous evidence out of reporting and agree the reporting timezone and original credit before publishing. A paid status, marked-sent status, boolean, or creation date cannot stand in for first success. The branch did not send test invoices. [Invoice history schema](https://www.zoho.com/inventory/api/v1/invoices/invoices.yml) · [Activity reports](https://www.zoho.com/us/inventory/help/reports/activity-reports.html) · [Reporting evidence guide](SALES_CRM_ZOHO_REPORTING.md)
