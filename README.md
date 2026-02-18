# Blueprint MVP

Blueprint is a Next.js command center for TAS execution. Salesforce is canonical for TAS answers; this app provides evidence-grounded suggestions, approval workflow, audit visibility, and manager walkthrough UX.

## Implemented product surfaces

- Dashboard (`/dashboard`)
  - List deals for an owner email
  - Create new deal cards
  - Optional Salesforce opportunity creation on card creation
- Connectors (`/connectors`)
  - Dedicated connector health page in left nav
  - Auto-check/probe on page load
  - Configured vs connected vs degraded status with setup hints
- Deal page (`/deals/[opportunityId]`)
  - TAS section/question cards
  - Source signal highlights
  - Audit-backed commitment recommendations
- Walkthrough mode (`/walkthrough`)
- Review queue (`/review`)
- Audit board (`/audit`)

## API routes

- `GET /api/deals?ownerEmail=<email>&withSignals=true|false`
- `POST /api/deals`
- `GET /api/deals/[opportunityId]`
- `PATCH /api/deals/[opportunityId]/tas`
- `GET /api/deals/[opportunityId]/audit`
- `GET /api/suggestions`
- `POST /api/suggestions/[suggestionId]/decision`
- `POST /api/commitments`
- `POST /api/ingest/gong`
- `POST /api/slack/events`
- `GET /api/connector-health`
- `GET /api/connector-health?probe=true` (runs live connection probes)
- `GET|POST /api/source-mapping`

## Environment variables

Required for local runtime:

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/blueprint
```

Salesforce integration:

```bash
SALESFORCE_INSTANCE_URL=https://your-instance.my.salesforce.com
SALESFORCE_ACCESS_TOKEN=...
SALESFORCE_API_VERSION=v60.0
SALESFORCE_TAS_OBJECT=Opportunity_Blueprint__c
SALESFORCE_TAS_OPPORTUNITY_FIELD=Opportunity__c
SALESFORCE_TAS_FIELD_MAP={"q1":"Strategic_Initiative__c","q2":"CEO_Priority__c"}
```

Gmail integration:

```bash
GOOGLE_GMAIL_ACCESS_TOKEN=...
```

Slack integration:

```bash
SLACK_USER_TOKEN=xoxp-... # preferred for search.messages
# or
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=... # required for /api/slack/events
SLACK_DEAL_UPDATES_CHANNEL_ID=C01234567 # optional, restrict updates to one channel
```

Slack deal update message format (recommended):

```text
deal: 006xx000001A1 | account: Northstar Bank | opportunity: Fraud Ops Copilot | signer confirmed CFO path via procurement sync
```

How it works:
- Slack channel messages received at `/api/slack/events` are stored as deal context updates.
- Messages are matched to deals by `deal:<id>` first, then by account/opportunity text.
- Connector signals (Gmail/Slack/Gong/GTM Agent + Slack channel updates) are deduplicated and standardized into consolidated insights per deal.

Gong integration:

```bash
GONG_ACCESS_KEY=...
GONG_ACCESS_KEY_SECRET=...
GONG_API_BASE_URL=https://api.gong.io
# optional override endpoint
GONG_SIGNAL_ENDPOINT=https://.../custom-gong-signal-endpoint
```

GTM Agent integration:

```bash
GTM_AGENT_BASE_URL=https://...
GTM_AGENT_API_KEY=...
```

Optional UI defaults:

```bash
NEXT_PUBLIC_DEFAULT_OWNER_EMAIL=owner@company.com
```

Optional local storage directory override:

```bash
BLUEPRINT_DATA_DIR=/absolute/path/to/writable/storage
```

Notes:
- In serverless/container runtimes (for example Vercel/Render), the app defaults local JSON storage to `/tmp/blueprint-data`.
- If no writable filesystem is available, the app falls back to in-memory storage for manual cards and Slack channel updates.

## Run locally

```bash
npm install
npm run dev
```

## Quality checks

```bash
npm run lint
npm run test
npm run build
```
