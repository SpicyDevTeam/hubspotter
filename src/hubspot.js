'use strict';

const { Client } = require('@hubspot/api-client');
const { config } = require('./config');

function getClient() {
	if (!config.hubspotToken) {
		throw new Error('HUBSPOT_PRIVATE_APP_TOKEN is not set');
	}
	return new Client({ accessToken: config.hubspotToken });
}

async function ensureCustomProperty(client, objectType, propertyName, propertyDef) {
	console.log(`🔍 Checking if property ${propertyName} exists for ${objectType}...`);
	try {
		const existing = await client.crm.properties.coreApi.getByName(objectType, propertyName);
		console.log(`✓ Property ${propertyName} already exists for ${objectType}`);
		return;
	} catch (err) {
		console.log(`❌ Property check failed with status: ${err?.statusCode}, message: ${err?.message}`);
		
		if (err?.statusCode === 404 || err?.status === 404 || err?.code === 404) {
			console.log(`🔨 Creating custom property ${propertyName} for ${objectType}...`);
			try {
				const propertyRequest = {
					name: propertyName,
					label: propertyDef.label,
					type: propertyDef.type || 'number',
					fieldType: propertyDef.fieldType || 'number',
					groupName: propertyDef.groupName || 'companyinformation',
					description: propertyDef.description || '',
					options: []
				};
				console.log(`📋 Property request:`, JSON.stringify(propertyRequest, null, 2));
				const result = await client.crm.properties.coreApi.create(objectType, propertyRequest);
				console.log(`✅ Successfully created property ${propertyName} for ${objectType}`);
				console.log(`📄 Created property details:`, result);
				return;
			} catch (createErr) {
				console.error(`💥 Failed to create property ${propertyName}:`, createErr);
				console.error(`💥 Create error status:`, createErr?.statusCode || createErr?.status);
				console.error(`💥 Create error body:`, createErr?.body || createErr?.response?.body);
				console.error(`💥 Create error message:`, createErr?.message);
				throw createErr;
			}
		} else {
			console.error(`💥 Unexpected error checking property ${propertyName}:`, err);
			throw err;
		}
	}
}

async function ensureSchema() {
	console.log('🔧 Setting up HubSpot custom properties...');
	const client = getClient();
	
	// Test basic API access first
	try {
		console.log('Testing HubSpot API access...');
		const testResponse = await client.crm.companies.basicApi.getPage(1);
		console.log('✓ HubSpot API access confirmed');
	} catch (testErr) {
		console.error('❌ HubSpot API access failed:', testErr.message);
		throw new Error(`HubSpot API access failed: ${testErr.message}`);
	}
	
	await ensureCustomProperty(client, 'companies', 'cscart_company_id', {
		label: 'CS-Cart Company ID',
		type: 'number',
		fieldType: 'number',
		groupName: 'companyinformation',
		description: 'External CS-Cart company_id',
	});
	await ensureCustomProperty(client, 'companies', 'cscart_product_count', {
		label: 'CS-Cart Product Count',
		type: 'number',
		fieldType: 'number',
		groupName: 'companyinformation',
		description: 'Number of products in CS-Cart',
	});
	await ensureCustomProperty(client, 'companies', 'cscart_order_count', {
		label: 'CS-Cart Order Count',
		type: 'number',
		fieldType: 'number',
		groupName: 'companyinformation',
		description: 'Number of orders in CS-Cart',
	});
	await ensureCustomProperty(client, 'companies', 'cscart_email', {
		label: 'CS-Cart Email',
		type: 'string',
		fieldType: 'text',
		groupName: 'companyinformation',
		description: 'Company email from CS-Cart',
	});
	await ensureCustomProperty(client, 'contacts', 'cscart_user_id', {
		label: 'CS-Cart User ID',
		type: 'number',
		fieldType: 'number',
		groupName: 'contactinformation',
		description: 'External CS-Cart user_id',
	});
	await ensureCustomProperty(client, 'contacts', 'cscart_last_login', {
		label: 'CS-Cart Last Login',
		type: 'datetime',
		fieldType: 'date',
		groupName: 'contactinformation',
		description: 'Last login time from CS-Cart',
	});
	console.log('✅ HubSpot schema setup complete');
	return client;
}

async function searchObjectByProperty(client, objectType, propertyName, value) {
	const req = {
		filterGroups: [
			{
				filters: [
					{ propertyName, operator: 'EQ', value: String(value) },
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
	console.log(`🏢 Upserting company with cscart_company_id: ${externalId}, dryRun: ${dryRun}`);
	console.log(`📋 Company properties:`, JSON.stringify(properties, null, 2));
	
	if (externalId == null) throw new Error('upsertCompany: missing cscart_company_id');
	
	let existing = null;
	try {
		console.log(`🔍 Searching for existing company with cscart_company_id: ${externalId}`);
		existing = await searchObjectByProperty(client, 'companies', 'cscart_company_id', externalId);
		if (existing) {
			console.log(`✅ Found existing company:`, existing);
		} else {
			console.log(`❌ No existing company found`);
		}
	} catch (err) {
		console.error(`💥 Company search failed for ${externalId}:`, err.message);
		throw new Error(`Company search failed for ${externalId}: ${err.message}`);
	}
	
	if (existing) {
		if (dryRun) {
			console.log(`🧪 DRY RUN: Would update existing company ${existing.id}`);
			return { id: existing.id, created: false };
		}
		console.log(`🔄 Updating existing company ${existing.id}`);
		await client.crm.companies.basicApi.update(existing.id, { properties });
		console.log(`✅ Updated company ${existing.id}`);
		return { id: existing.id, created: false };
	}
	
	if (dryRun) {
		console.log(`🧪 DRY RUN: Would create new company`);
		return { id: null, created: true };
	}
	
	console.log(`🆕 Creating new company`);
	const res = await client.crm.companies.basicApi.create({ properties });
	console.log(`✅ Created new company with ID: ${res.id}`);
	return { id: res.id, created: true };
}

async function upsertContact(client, properties, { dryRun = false } = {}) {
	const externalId = properties.cscart_user_id;
	console.log(`👤 Upserting contact with cscart_user_id: ${externalId}, dryRun: ${dryRun}`);
	console.log(`📋 Contact properties:`, JSON.stringify(properties, null, 2));
	
	if (externalId == null) throw new Error('upsertContact: missing cscart_user_id');
	
	let existing = null;
	try {
		console.log(`🔍 Searching for existing contact with cscart_user_id: ${externalId}`);
		existing = await searchObjectByProperty(client, 'contacts', 'cscart_user_id', externalId);
		if (existing) {
			console.log(`✅ Found existing contact:`, existing);
		} else {
			console.log(`❌ No existing contact found`);
		}
	} catch (err) {
		console.error(`💥 Contact search failed for ${externalId}:`, err.message);
		throw new Error(`Contact search failed for ${externalId}: ${err.message}`);
	}
	
	if (existing) {
		if (dryRun) {
			console.log(`🧪 DRY RUN: Would update existing contact ${existing.id}`);
			return { id: existing.id, created: false };
		}
		console.log(`🔄 Updating existing contact ${existing.id}`);
		await client.crm.contacts.basicApi.update(existing.id, { properties });
		console.log(`✅ Updated contact ${existing.id}`);
		return { id: existing.id, created: false };
	}
	
	if (dryRun) {
		console.log(`🧪 DRY RUN: Would create new contact`);
		return { id: null, created: true };
	}
	
	console.log(`🆕 Creating new contact`);
	const res = await client.crm.contacts.basicApi.create({ properties });
	console.log(`✅ Created new contact with ID: ${res.id}`);
	return { id: res.id, created: true };
}

async function associateContactToCompany(client, contactId, companyId, { dryRun = false } = {}) {
	if (!contactId || !companyId) return;
	if (dryRun) return;
	await client.crm.associations.v4.basicApi.create('contacts', contactId, 'companies', companyId, [
		{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 280 }
	]);
}

module.exports = {
	ensureSchema,
	getClient,
	upsertCompany,
	upsertContact,
	associateContactToCompany,
};


