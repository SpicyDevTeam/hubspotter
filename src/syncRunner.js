'use strict';

const pLimit = require('p-limit');
const { config } = require('./config');
const { createPool, fetchCompanies, fetchAdminUsersForCompanies } = require('./db');
const { ensureSchema, upsertCompany, upsertContact, associateContactToCompany } = require('./hubspot');
const { mapCompanyRowToHubSpotProperties, mapUserRowToHubSpotContactProperties } = require('./map');

async function runSync({ dryRun = config.dryRun, companyIds = config.companyIdsFilter } = {}, onEvent) {
	const emit = (e) => {
		if (typeof onEvent === 'function') onEvent(e);
		else if (e?.level === 'error') console.error(e.message);
		else console.log(e?.message || e);
	};

	const pool = await createPool();
	const client = await ensureSchema();

	const companies = await fetchCompanies(pool, { pageSize: config.pageSize, companyIds });
	emit({ level: 'info', message: `Fetched ${companies.length} companies` });

	const companyIdList = companies.map((c) => c.company_id);
	const adminUsers = await fetchAdminUsersForCompanies(pool, companyIdList);
	emit({ level: 'info', message: `Fetched ${adminUsers.length} admin users` });

	const companyIdToHubspotId = new Map();
	const limit = pLimit(config.concurrency);

	await Promise.all(
		companies.map((company) =>
			limit(async () => {
				const properties = mapCompanyRowToHubSpotProperties(company);
				try {
					const res = await upsertCompany(client, properties, { dryRun });
					companyIdToHubspotId.set(company.company_id, res.id);
					emit({ level: 'info', message: `${res.created ? 'Created' : 'Updated'} company ${company.company_id} → ${res.id || '(dry-run)'}` });
				} catch (err) {
					emit({ level: 'error', message: `Failed to upsert company ${company.company_id}: ${err.message}` });
				}
			})
		)
	);

	await Promise.all(
		adminUsers.map((user) =>
			limit(async () => {
				const company = companies.find((c) => c.company_id === user.company_id);
				const properties = mapUserRowToHubSpotContactProperties(user, company);
				try {
					const res = await upsertContact(client, properties, { dryRun });
					emit({ level: 'info', message: `${res.created ? 'Created' : 'Updated'} contact user ${user.user_id} → ${res.id || '(dry-run)'}` });
					const hsCompanyId = companyIdToHubspotId.get(user.company_id);
					if (hsCompanyId) {
						await associateContactToCompany(client, res.id, hsCompanyId, { dryRun });
						emit({ level: 'info', message: `Associated contact ${res.id || '(dry-run)'} -> company ${hsCompanyId || '(dry-run)'}` });
					}
				} catch (err) {
					const status = err?.statusCode || err?.status;
					const body = err?.body || err?.response?.body;
					emit({ level: 'error', message: `Failed to upsert/associate contact user ${user.user_id}: ${err?.message || 'Unknown error'}${status ? ` (HTTP ${status})` : ''}${body ? ` | body=${typeof body === 'string' ? body : JSON.stringify(body)}` : ''}` });
				}
			})
		)
	);

	await pool.end();
	return { companiesProcessed: companies.length, usersProcessed: adminUsers.length };
}

module.exports = { runSync };


