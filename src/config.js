'use strict';

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
	dotenv.config({ path: envPath });
}

function getNumber(name, def) {
	const v = process.env[name];
	if (v === undefined || v === '') return def;
	const n = Number(v);
	return Number.isFinite(n) ? n : def;
}

const config = {
	hubspotToken: process.env.HUBSPOT_PRIVATE_APP_TOKEN || '',
	database: {
		host: process.env.DB_HOST || '127.0.0.1',
		port: getNumber('DB_PORT', 3306),
		user: process.env.DB_USER || 'root',
		password: process.env.DB_PASSWORD || '',
		database: process.env.DB_NAME || 'cscart',
	},
	concurrency: getNumber('SYNC_CONCURRENCY', 5),
	pageSize: getNumber('PAGE_SIZE', 100),
	companyIdsFilter: (process.env.COMPANY_IDS || '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
		.map((s) => Number(s))
		.filter((n) => Number.isFinite(n)),
	dryRun: String(process.env.DRY_RUN || '').toLowerCase() === 'true',
	serverPort: getNumber('PORT', 3000),
};

module.exports = { config };


