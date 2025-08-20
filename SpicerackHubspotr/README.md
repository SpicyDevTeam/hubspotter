## Spicerack HubSpot Sync

Sync CS-Cart `cscart_companies` and admin users to HubSpot companies and contacts, with associations.

### Prerequisites

- Node.js 18+
- HubSpot Private App token with CRM scopes (crm.objects.companies.write, crm.objects.contacts.write, crm.schemas.companies.read/write, crm.schemas.contacts.read/write, crm.objects.contacts.read, crm.objects.companies.read, crm.objects.owners.read)
- MySQL access to the CS-Cart database

### Setup

1. Create a `.env` in the project root with:

```
HUBSPOT_PRIVATE_APP_TOKEN=hs_pat_xxx

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=secret
DB_NAME=cscart

SYNC_CONCURRENCY=5
PAGE_SIZE=500
COMPANY_IDS=
DRY_RUN=false
```

2. Install dependencies:

```
npm install
```

### Running

- Dry-run (no writes):

```
npm run dry
```

- Full sync:

```
npm run sync
```

You can filter a subset by setting `COMPANY_IDS` to a comma-separated list of CS-Cart `company_id` values.

### What it does

- Ensures custom properties exist:
  - Company: `cscart_company_id` (number)
  - Contact: `cscart_user_id` (number)
- Upserts CS-Cart companies to HubSpot companies
- Upserts CS-Cart admin users to HubSpot contacts
- Associates contacts to their company

### Mapping

- Company → HubSpot Company
  - `company` → `name`
  - `url` → `domain`
  - `phone` → `phone`
  - `city` → `city`
  - `state` → `state`
  - `country` → `country`
  - `zipcode` → `zip`
  - `address` → `address`
  - `email` → `email`
  - `company_id` → `cscart_company_id`

- Admin User (`cscart_users.is_admin = 'Y'`) → HubSpot Contact
  - `email` → `email`
  - `firstname` → `firstname`
  - `lastname` → `lastname`
  - `phone` → `phone`
  - constant `Admin` → `jobtitle`
  - company's `company` → `company`
  - `user_id` → `cscart_user_id`

### Notes

- The script uses search-by-custom-id upsert semantics; it will create or update based on existing `cscart_company_id`/`cscart_user_id`.
- Associations use the default HubSpot contact→company relation.


