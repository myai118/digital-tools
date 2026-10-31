# Client Monitor account administration

Cloudflare Worker hosts the protected Client Monitor and a generic Client Admin screen at /admin, with email/password login and eight-hour revocable sessions. The Client Admin combines account management with per-account ticker selection. Central GitHub ticker settings and market JSON remain upstream. Browser data polling is every 15 minutes.

## Initial administrator

In Cloudflare Workers & Pages > klz-monitor > Settings > Variables and Secrets, add a secret named SETUP_KEY containing a private random value of at least 24 characters. Deploy the secret change. Open /setup and enter that key, jjkwan118@gmail.com, and your chosen administrator password (at least 12 characters). The first account is created once only. Remove SETUP_KEY afterwards; it cannot reset or recreate an existing administrator. Keep the administrator password safely.

At /admin, add users (maximum 50 including administrator), select a client profile, assign its ticker list, disable/enable accounts, or reset passwords. Disabling or resetting an account invalidates all its existing sessions. Give credentials to users privately. Passwords use unique random salts and PBKDF2 hashes, never plaintext storage. Wrong login attempts are throttled. Cookies are Secure, HttpOnly, SameSite=Strict; mutations require same-origin and session CSRF tokens. No public signup. Administrator passwords are reset by a signed-in administrator; automatic email recovery is not implemented.

## Deployment

Source snapshot is the parent digital-tools repository. In cloudflare-klz run npm install --no-audit --no-fund, npm test, KLZ_SOURCE_ROOT=.. npm run build, npx wrangler deploy. The main-branch workflow .github/workflows/deploy-klz-cloudflare.yml checks out this branch and deploys with repository secrets CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID. Dashboard secret variables are preserved. Account/session data is stored in a private SQLite-backed Durable Object named ACCOUNTS, created by the accounts-v1 migration. No Zero Trust subscription is needed. Account data is not stored in GitHub. Back up before migrations; do not remove the namespace binding or reset storage.

## Security boundaries

All HTML and assets pass through the Worker before serving. The JSON endpoint requires an active account. Existing public GitHub pages and JSON remain public; this deployment does not retire those copies. Authorised users can still inspect downloaded frontend HTML and JavaScript. Live testing of login, mobile layout and Excel saves is required after initial account setup.

## Client hostname

Public Worker: client-monitor at https://client-monitor.myai118-client.workers.dev. The ACCOUNTS binding uses class Accounts from script_name klz-monitor and the existing object name klz-accounts-v1. Keep klz-monitor deployed: it owns all existing account storage and authentication secrets. Do not delete that Worker or create a replacement account namespace. This branch intentionally exports no Durable Object class and declares no new migrations. Changing the hostname requires users to sign in again; existing accounts and passwords remain valid.
## Per-client ticker lists

The Client Admin can assign up to 100 enabled ticker symbols to each login. New client accounts start with an empty list until tickers are assigned. The administrator keeps the existing KLZ defaults unless a list is explicitly saved. Lists are stored with the account in the existing private Durable Object account store, not in GitHub. The authenticated snapshot endpoint returns only that account's configured instruments, prices and dividend records. The shared price checker still refreshes the common instrument catalogue once; a ticker must first be enabled there to be assigned to a client. No per-client checker program is created.

Deploy the updated account-storage Worker (the `klz-monitor` Worker) before deploying the Client Worker, so the shared account service understands ticker-list updates. Keep the existing account namespace binding and Worker; replacing it would risk existing login data. The deployment workflow deploys the Client Worker. Keep the existing account-storage Worker and namespace binding intact.

