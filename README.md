# SpicerackHubspotr - CS-Cart to HubSpot Sync

A Next.js application that syncs CS-Cart companies and admin users to HubSpot as companies and contacts.

## Features

- 🔐 **Secure Login** - Access code protected dashboard
- 🏢 **Company Sync** - Sync CS-Cart companies to HubSpot companies
- 👤 **Contact Sync** - Sync CS-Cart admin users to HubSpot contacts  
- 🔗 **Associations** - Automatically associate contacts to companies
- 📊 **Rich Data** - Includes product counts, order counts, and last login times
- 🎛️ **Granular Control** - Sync all companies or specific ones
- 🧪 **Dry Run Mode** - Test syncs without writing to HubSpot
- 🚫 **Duplicate Prevention** - Built-in sync status tracking

## Quick Start

### Environment Variables

Create a `.env` file with:

```env
HUBSPOT_PRIVATE_APP_TOKEN=your_hubspot_token
DB_HOST=your_mysql_host
DB_PORT=3306
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=cscart
SYNC_CONCURRENCY=5
PAGE_SIZE=500
```

### Local Development

```bash
npm install
npm run dev
```

Visit http://localhost:3021 and use access code `2406598908`

### Deployment

Deploy to Vercel with one click:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/SpicerackHubspotr)

## HubSpot Setup

Your HubSpot Private App needs these scopes:
- `crm.objects.companies.read`
- `crm.objects.companies.write`
- `crm.objects.contacts.read`
- `crm.objects.contacts.write`
- `crm.schemas.companies.read`
- `crm.schemas.companies.write`
- `crm.schemas.contacts.read`
- `crm.schemas.contacts.write`

## Data Mapping

### Companies
- CS-Cart `company` → HubSpot `name`
- CS-Cart `url` → HubSpot `domain`
- CS-Cart `email` → HubSpot `email`
- CS-Cart `phone` → HubSpot `phone`
- CS-Cart `city` → HubSpot `city`
- CS-Cart `state` → HubSpot `state`
- CS-Cart `country` → HubSpot `country`
- CS-Cart `zipcode` → HubSpot `zip`
- CS-Cart `address` → HubSpot `address`
- Product count → Custom property `cscart_product_count`
- Order count → Custom property `cscart_order_count`

### Contacts (Admin Users)
- CS-Cart `email` → HubSpot `email`
- CS-Cart `firstname` → HubSpot `firstname`
- CS-Cart `lastname` → HubSpot `lastname`
- CS-Cart `phone` → HubSpot `phone`
- CS-Cart `last_login` → Custom property `cscart_last_login`
- Job title set to "Admin"

## Tech Stack

- **Frontend**: Next.js 14, React 18, Tailwind CSS
- **Backend**: Node.js, TypeScript
- **Database**: MySQL (CS-Cart)
- **CRM**: HubSpot API
- **Deployment**: Vercel

## License

MIT
