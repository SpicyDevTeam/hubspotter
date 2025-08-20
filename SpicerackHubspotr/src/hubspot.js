'use strict';

const { Client } = require('@hubspot/api-client');
const pLimit = require('p-limit');
const { config } = require('./config');

function getClient() {
	if (!config.hubspotToken) {
		throw new Error('HUBSPOT_PRIVATE_APP_TOKEN is not set');
	}
	return new Client({ accessToken: config.hubspotToken });
}

async function ensureCustomProperty(client, objectType, propertyName, propertyDef) {
	try {
		await client.crm.properties.coreApi.getByName(objectType, propertyName);
		return;
	} catch (err) {
		// Not found -> create
		if (err?.statusCode === 404) {
			await client.crm.properties.coreApi.create(objectType, {
				name: propertyName,
				label: propertyDef.label,
				type: propertyDef.type || 'number',
				fieldType: propertyDef.fieldType || 'number',
				groupName: propertyDef.groupName || 'companyinformation',
				description: propertyDef.description || '',
			});
			return;
		}
		throw err;
	}
}

async function ensureSchema() {
	const client = getClient();
	await ensureCustomProperty(client, 'companies', 'cscart_company_id', {
		label: 'CS-Cart Company ID',
		type: 'number',
		fieldType: 'number',
		groupName: 'companyinformation',
		description: 'External CS-Cart company_id',
	});
	await ensureCustomProperty(client, 'contacts', 'cscart_user_id', {
		label: 'CS-Cart User ID',
		type: 'number',
		fieldType: 'number',
		groupName: 'contactinformation',
		description: 'External CS-Cart user_id',
	});
	return client;
}

async function searchObjectByProperty(client, objectType, propertyName, value) {
	const req = {
		filterGroups: [
			{
				filters: [
					{
						propertyName,
						operator: 'EQ',
						value: String(value),
					},
				],
			},
		],
		limit: 1,
		properties: ['hs_object_id', propertyName],
	};
	const res = await client.crm[objectType].searchApi.doSearch(req);
	return res?.results?.[0] || null;
}

async function upsertCompany(client, properties, { dryRun = false } = {}) {
	const externalId = properties.cscart_company_id;
	if (externalId == null) throw new Error('upsertCompany: missing cscart_company_id');
	let existing = null;
	try {
		existing = await searchObjectByProperty(client, 'companies', 'cscart_company_id', externalId);
	} catch (err) {
		throw new Error(`Company search failed for ${externalId}: ${err.message}`);
	}
	if (existing) {
		if (dryRun) return { id: existing.id, created: false };
		await client.crm.companies.basicApi.update(existing.id, { properties });
		return { id: existing.id, created: false };
	}
	if (dryRun) return { id: null, created: true };
	const res = await client.crm.companies.basicApi.create({ properties });
	return { id: res.id, created: true };
}

async function upsertContact(client, properties, { dryRun = false } = {}) {
	const externalId = properties.cscart_user_id;
	if (externalId == null) throw new Error('upsertContact: missing cscart_user_id');
	let existing = null;
	try {
		existing = await searchObjectByProperty(client, 'contacts', 'cscart_user_id', externalId);
	} catch (err) {
		throw new Error(`Contact search failed for ${externalId}: ${err.message}`);
	}
	if (existing) {
		if (dryRun) return { id: existing.id, created: false };
		await client.crm.contacts.basicApi.update(existing.id, { properties });
		return { id: existing.id, created: false };
	}
	if (dryRun) return { id: null, created: true };
	const res = await client.crm.contacts.basicApi.create({ properties });
	return { id: res.id, created: true };
}

async function associateContactToCompany(client, contactId, companyId, { dryRun = false } = {}) {
	if (!contactId || !companyId) return;
	if (dryRun) return;
	// v4 Associations basic API
	await client.crm.associations.v4.basicApi.create('contacts', contactId, 'companies', companyId, [
		{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 280 } // 280 is contact_to_company
	]);
}

module.exports = {
	ensureSchema,
	getClient,
	upsertCompany,
	upsertContact,
	associateContactToCompany,
};


