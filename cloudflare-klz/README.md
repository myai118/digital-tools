# Private KLZ Cloudflare Worker

Prepared from myai118/digital-tools: myweb/klz.html and stock-monitor/tools/kwc.html. The published monitor is named tools-klz.html and deliberately uses tools/klz.html defaults from the existing admin.

## Build from this repository branch

Cloudflare Workers Git build settings:
- Root directory: cloudflare-klz
- Build command: npm install --no-audit --no-fund && KLZ_SOURCE_ROOT=.. npm run build
- Deploy command: npx wrangler deploy
- Worker name: klz-monitor

For the standalone review copy, use npm install --no-audit --no-fund && npm run build; it includes a source snapshot and two images.

## Access setup required before it will serve content

1. Configure Cloudflare Access on the entire Worker, including its workers.dev address and any preview/custom addresses. Enable One-time PIN and add only the approved visitor email. Set an eight-hour session.
2. Set ACCESS_TEAM_DOMAIN to the actual team domain (name.cloudflareaccess.com), ACCESS_AUD to this application's actual Audience tag, and ALLOWED_EMAILS to the comma-separated approved visitor emails in Worker variables.
3. Update both Access policy and ALLOWED_EMAILS when adding/removing users. Revoke active Access sessions when immediately removing someone.
4. Configure Access before testing normal visits. The Worker returns 401 until configuration and a valid signed Access JWT are present. There is no public development bypass.

Worker checks RS256 signature, issuer, audience, expiry and email. All files pass through authentication; assets.run_worker_first=true. Preview URLs disabled. No GitHub token is needed for current public JSON sources.

## Behaviour

/myweb-klz.html links to /tools-klz.html. Return button always goes to /myweb-klz.html. Other sites retain existing GitHub URLs. Monitor fetches one /api/snapshot every 15 minutes, and on focus only when due. Response combines ticker configuration, KLZ defaults, market data and dividends. Upstream failure keeps existing browser display and reports failure. GitHub admin saves apply on reload. Price checker is unaffected.

## Verification

npm test covers missing authentication/configuration, signed approved users, wrong user/audience, expiry/tampering, protected asset/API paths, upstream errors and KLZ-only defaults. npm run build and wrangler deploy --dry-run validate package. Live OTP login, CPU usage, mobile rendering and Excel file selection require testing after deployment.

## Boundaries

This protects Cloudflare access, not existing public GitHub copies or public JSON. No existing GitHub page has been redirected or retired. Authorised users can inspect received frontend files. This branch must not be merged automatically into main; it is an isolated deployment preparation branch.
