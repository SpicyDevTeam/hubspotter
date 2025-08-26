'use strict';

const { Client } = require('@hubspot/api-client');
const { config } = require('./config');

// Rate limiting utility
function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

// Rate-limited API call wrapper
async function rateLimitedCall(apiCall) {
	const result = await apiCall();
	// Add delay after each API call to respect rate limits
	if (config.rateLimitDelay > 0) {
		await sleep(config.rateLimitDelay);
	}
	return result;
}

function getClient() {
	if (!config.hubspotToken) {
		throw new Error('HUBSPOT_PRIVATE_APP_TOKEN is not set');
	}
	return new Client({ accessToken: config.hubspotToken });
}

async function ensureCustomProperty(client, objectType, propertyName, propertyDef) {
	console.log(`🔍 Checking if property ${propertyName} exists for ${objectType}...`);
	try {
		const existing = await rateLimitedCall(() => client.crm.properties.coreApi.getByName(objectType, propertyName));
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
				const result = await rateLimitedCall(() => client.crm.properties.coreApi.create(objectType, propertyRequest));
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
		const testResponse = await rateLimitedCall(() => client.crm.companies.basicApi.getPage(1));
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
	await ensureCustomProperty(client, 'companies', 'cscart_status', {
		label: 'CS-Cart Status',
		type: 'enumeration',
		fieldType: 'select',
		groupName: 'companyinformation',
		description: 'Company status from CS-Cart (A=Active, D=Draft, S=Suspended)',
		options: [
			{ label: 'Active', value: 'A' },
			{ label: 'Draft', value: 'D' },
			{ label: 'Suspended', value: 'S' }
		]
	});
	await ensureCustomProperty(client, 'companies', 'cscart_payment_methods', {
		label: 'CS-Cart Payment Methods',
		type: 'string',
		fieldType: 'text',
		groupName: 'companyinformation',
		description: 'Available payment methods (PayPal, Stripe)',
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
	const res = await rateLimitedCall(() => client.crm[objectType].searchApi.doSearch(req));
	return res?.results?.[0] || null;
}

async function upsertCompany(client, properties, { dryRun = false } = {}) {
	const externalId = properties.cscart_company_id;
	console.log(`🏢 Upserting company with cscart_company_id: ${externalId}, dryRun: ${dryRun}`);
	console.log(`📋 Company properties:`, JSON.stringify(properties, null, 2));
	
	// Validate required properties
	if (!properties.name) {
		throw new Error('Company name is required but missing');
	}
	
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
		await rateLimitedCall(() => client.crm.companies.basicApi.update(existing.id, { properties }));
		console.log(`✅ Updated company ${existing.id}`);
		return { id: existing.id, created: false };
	}
	
	if (dryRun) {
		console.log(`🧪 DRY RUN: Would create new company`);
		return { id: null, created: true };
	}
	
	console.log(`🆕 Creating new company`);
	console.log(`📋 Company creation request:`, JSON.stringify({ properties }, null, 2));
	const res = await rateLimitedCall(() => client.crm.companies.basicApi.create({ properties }));
	console.log(`✅ Created new company with ID: ${res.id}`);
	console.log(`📄 Company creation response:`, res);
	return { id: res.id, created: true };
}

async function upsertContact(client, properties, { dryRun = false } = {}) {
	const externalId = properties.cscart_user_id;
	console.log(`👤 Upserting contact with cscart_user_id: ${externalId}, dryRun: ${dryRun}`);
	console.log(`📋 Contact properties:`, JSON.stringify(properties, null, 2));
	
	// Validate required properties
	if (!properties.email && !properties.firstname && !properties.lastname) {
		console.log(`⚠️ Warning: Contact has no email, firstname, or lastname - this might cause issues`);
	}
	
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
		await rateLimitedCall(() => client.crm.contacts.basicApi.update(existing.id, { properties }));
		console.log(`✅ Updated contact ${existing.id}`);
		return { id: existing.id, created: false };
	}
	
	if (dryRun) {
		console.log(`🧪 DRY RUN: Would create new contact`);
		return { id: null, created: true };
	}
	
	console.log(`🆕 Creating new contact`);
	console.log(`📋 Contact creation request:`, JSON.stringify({ properties }, null, 2));
	const res = await rateLimitedCall(() => client.crm.contacts.basicApi.create({ properties }));
	console.log(`✅ Created new contact with ID: ${res.id}`);
	console.log(`📄 Contact creation response:`, res);
	return { id: res.id, created: true };
}

async function associateContactToCompany(client, contactId, companyId, { dryRun = false } = {}) {
	if (!contactId || !companyId) return;
	if (dryRun) return;
	await rateLimitedCall(() => client.crm.associations.v4.basicApi.create('contacts', contactId, 'companies', companyId, [
		{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 280 }
	]));
}

// Function to find and remove duplicate companies in HubSpot after CS-Cart merge
async function cleanupHubSpotDuplicates(client, mergedCompanyIds, { dryRun = false } = {}) {
	console.log(`🧹 Cleaning up HubSpot duplicates for CS-Cart companies: ${mergedCompanyIds.join(', ')}, dryRun: ${dryRun}`);
	
	const results = {
		found: [],
		deleted: [],
		errors: [],
		dryRun
	};

	for (const companyId of mergedCompanyIds) {
		try {
			console.log(`🔍 Searching for HubSpot company with cscart_company_id: ${companyId}`);
			const existing = await searchObjectByProperty(client, 'companies', 'cscart_company_id', companyId);
			
			if (existing) {
				results.found.push({
					cscartId: companyId,
					hubspotId: existing.id
				});
				
				if (!dryRun) {
					console.log(`🗑️ Deleting HubSpot company ${existing.id} (cscart_company_id: ${companyId})`);
					await rateLimitedCall(() => client.crm.companies.basicApi.archive(existing.id));
					results.deleted.push({
						cscartId: companyId,
						hubspotId: existing.id
					});
					console.log(`✅ Deleted HubSpot company ${existing.id}`);
				} else {
					console.log(`🧪 DRY RUN: Would delete HubSpot company ${existing.id} (cscart_company_id: ${companyId})`);
				}
			} else {
				console.log(`❌ No HubSpot company found for cscart_company_id: ${companyId}`);
			}
		} catch (err) {
			console.error(`💥 Failed to cleanup HubSpot company for cscart_company_id ${companyId}:`, err.message);
			results.errors.push(`Failed to cleanup company ${companyId}: ${err.message}`);
		}
	}

	console.log(`🧹 HubSpot cleanup complete. Found: ${results.found.length}, Deleted: ${results.deleted.length}, Errors: ${results.errors.length}`);
	return results;
}

// Function to search HubSpot companies by name similarity
async function searchHubSpotCompaniesByName(client, companyName) {
	try {
		const req = {
			filterGroups: [
				{
					filters: [
						{ propertyName: 'name', operator: 'CONTAINS_TOKEN', value: companyName.trim() },
					],
				},
			],
			limit: 50, // Get more results to find potential matches
			properties: ['hs_object_id', 'name', 'domain', 'city', 'state', 'country', 'phone', 'cscart_company_id'],
		};
		const res = await rateLimitedCall(() => client.crm.companies.searchApi.doSearch(req));
		return res?.results || [];
	} catch (err) {
		console.error(`💥 Failed to search HubSpot companies for "${companyName}":`, err.message);
		return [];
	}
}

// Function to find all companies (CS-Cart + HubSpot-only) and identify duplicates using efficient filtering
async function findAllDuplicateCompanies(client, csCartCompanies) {
	console.log('🔍 Finding duplicates across CS-Cart and HubSpot companies...');
	
	// First, get HubSpot-only companies (without cscart_company_id) using search API
	const hubSpotOnlyCompanies = [];
	let after = undefined;
	
	do {
		try {
			const searchReq = {
				filterGroups: [
					{
						filters: [
							{ propertyName: 'cscart_company_id', operator: 'NOT_HAS_PROPERTY' },
							{ propertyName: 'name', operator: 'HAS_PROPERTY' } // Ensure company has a name
						],
					},
				],
				limit: 100,
				properties: ['hs_object_id', 'name', 'domain', 'city', 'state', 'country', 'phone', 'email'],
				after
			};
			
			const res = await rateLimitedCall(() => client.crm.companies.searchApi.doSearch(searchReq));
			if (res?.results) {
				hubSpotOnlyCompanies.push(...res.results);
			}
			after = res?.paging?.next?.after;
		} catch (err) {
			console.error('💥 Failed to search HubSpot-only companies:', err.message);
			break;
		}
	} while (after);
	
	console.log(`📊 Found ${hubSpotOnlyCompanies.length} HubSpot-only companies, ${csCartCompanies.length} CS-Cart companies`);
	
	// Create unified company list
	const allCompanies = [];
	
	// Add CS-Cart companies
	for (const csCompany of csCartCompanies) {
		allCompanies.push({
			id: `cs_${csCompany.company_id}`,
			name: csCompany.company,
			source: 'cs-cart',
			csCartId: csCompany.company_id,
			hubSpotId: null,
			email: csCompany.email,
			phone: csCompany.phone,
			city: csCompany.city,
			state: csCompany.state,
			country: csCompany.country,
			productCount: csCompany.product_count || 0,
			orderCount: csCompany.order_count || 0
		});
	}
	
	// Add HubSpot-only companies
	for (const hsCompany of hubSpotOnlyCompanies) {
		if (hsCompany.properties?.name) {
			allCompanies.push({
				id: `hs_${hsCompany.id}`,
				name: hsCompany.properties.name,
				source: 'hubspot',
				csCartId: null,
				hubSpotId: hsCompany.id,
				email: hsCompany.properties?.email || '',
				phone: hsCompany.properties?.phone || '',
				city: hsCompany.properties?.city || '',
				state: hsCompany.properties?.state || '',
				country: hsCompany.properties?.country || '',
				domain: hsCompany.properties?.domain || '',
				productCount: 0,
				orderCount: 0
			});
		}
	}
	
	// Group by normalized name
	const groups = new Map();
	
	for (const company of allCompanies) {
		if (!company.name) continue;
		
		const normalizedName = company.name
			.toLowerCase()
			.replace(/\s+/g, ' ')
			.replace(/\b(inc|corp|corporation|ltd|limited|llc|co|company)\b\.?$/g, '')
			.trim();
		
		if (!groups.has(normalizedName)) {
			groups.set(normalizedName, []);
		}
		groups.get(normalizedName).push(company);
	}
	
	// Return only groups with multiple companies
	const duplicates = [];
	for (const [normalizedName, companyGroup] of groups) {
		if (companyGroup.length > 1) {
			duplicates.push({
				normalizedName,
				companies: companyGroup,
				count: companyGroup.length,
				sources: [...new Set(companyGroup.map(c => c.source))]
			});
		}
	}
	
	console.log(`🎯 Found ${duplicates.length} duplicate groups from combined sources`);
	return duplicates.sort((a, b) => b.count - a.count);
}

// Alternative approach: Search for potential HubSpot duplicates for specific CS-Cart company names
async function findHubSpotDuplicatesForCSCartCompanies(client, csCartCompanies, { batchSize = 10 } = {}) {
	console.log('🔍 Searching HubSpot for potential duplicates of CS-Cart companies...');
	
	const duplicateGroups = [];
	const processedNames = new Set();
	
	// Process CS-Cart companies in batches to avoid rate limits
	for (let i = 0; i < csCartCompanies.length; i += batchSize) {
		const batch = csCartCompanies.slice(i, i + batchSize);
		
		await Promise.all(batch.map(async (csCompany) => {
			const normalizedName = csCompany.company
				.toLowerCase()
				.replace(/\s+/g, ' ')
				.replace(/\b(inc|corp|corporation|ltd|limited|llc|co|company)\b\.?$/g, '')
				.trim();
			
			// Skip if we've already processed this normalized name
			if (processedNames.has(normalizedName)) return;
			processedNames.add(normalizedName);
			
			try {
				// Search for HubSpot companies with similar names
				const searchTerms = [
					csCompany.company.trim(),
					normalizedName
				].filter(Boolean);
				
				const hubSpotMatches = [];
				
				for (const term of searchTerms) {
					if (term.length < 2) continue; // Skip very short terms
					
					const searchReq = {
						filterGroups: [
							{
								filters: [
									{ propertyName: 'name', operator: 'CONTAINS_TOKEN', value: term },
									{ propertyName: 'cscart_company_id', operator: 'NOT_HAS_PROPERTY' }
								],
							},
						],
						limit: 20,
						properties: ['hs_object_id', 'name', 'domain', 'city', 'state', 'country', 'phone', 'email'],
					};
					
					const res = await rateLimitedCall(() => client.crm.companies.searchApi.doSearch(searchReq));
					if (res?.results) {
						// Filter for closer matches
						const closeMatches = res.results.filter(hsCompany => {
							const hsNormalizedName = hsCompany.properties.name
								.toLowerCase()
								.replace(/\s+/g, ' ')
								.replace(/\b(inc|corp|corporation|ltd|limited|llc|co|company)\b\.?$/g, '')
								.trim();
							return hsNormalizedName === normalizedName;
						});
						hubSpotMatches.push(...closeMatches);
					}
				}
				
				if (hubSpotMatches.length > 0) {
					// Remove duplicates by ID
					const uniqueMatches = hubSpotMatches.filter((match, index, array) => 
						array.findIndex(m => m.id === match.id) === index
					);
					
					const companies = [
						{
							id: `cs_${csCompany.company_id}`,
							name: csCompany.company,
							source: 'cs-cart',
							csCartId: csCompany.company_id,
							hubSpotId: null,
							email: csCompany.email,
							phone: csCompany.phone,
							city: csCompany.city,
							state: csCompany.state,
							country: csCompany.country,
							productCount: csCompany.product_count || 0,
							orderCount: csCompany.order_count || 0
						},
						...uniqueMatches.map(hsMatch => ({
							id: `hs_${hsMatch.id}`,
							name: hsMatch.properties.name,
							source: 'hubspot',
							csCartId: null,
							hubSpotId: hsMatch.id,
							email: hsMatch.properties?.email || '',
							phone: hsMatch.properties?.phone || '',
							city: hsMatch.properties?.city || '',
							state: hsMatch.properties?.state || '',
							country: hsMatch.properties?.country || '',
							domain: hsMatch.properties?.domain || '',
							productCount: 0,
							orderCount: 0
						}))
					];
					
					duplicateGroups.push({
						normalizedName,
						companies,
						count: companies.length,
						sources: [...new Set(companies.map(c => c.source))]
					});
				}
			} catch (err) {
				console.error(`💥 Failed to search HubSpot for "${csCompany.company}":`, err.message);
			}
		}));
		
		// Add delay between batches to respect rate limits
		if (i + batchSize < csCartCompanies.length) {
			await sleep(100); // 100ms delay between batches
		}
	}
	
	console.log(`🎯 Found ${duplicateGroups.length} potential duplicate groups using targeted search`);
	return duplicateGroups.sort((a, b) => b.count - a.count);
}

// Function to merge HubSpot companies
async function mergeHubSpotCompanies(client, primaryHubSpotId, duplicateHubSpotIds, { dryRun = false } = {}) {
	console.log(`🏢 Merging HubSpot companies: primary=${primaryHubSpotId}, duplicates=[${duplicateHubSpotIds.join(', ')}], dryRun: ${dryRun}`);
	
	const results = {
		primary: null,
		merged: [],
		errors: [],
		dryRun
	};
	
	try {
		// Get primary company details
		const primary = await rateLimitedCall(() => client.crm.companies.basicApi.getById(primaryHubSpotId));
		results.primary = {
			id: primary.id,
			name: primary.properties?.name || 'Unknown'
		};
		
		for (const duplicateId of duplicateHubSpotIds) {
			if (duplicateId === primaryHubSpotId) {
				results.errors.push(`Cannot merge company ${duplicateId} with itself`);
				continue;
			}
			
			try {
				// Get duplicate company details
				const duplicate = await rateLimitedCall(() => client.crm.companies.basicApi.getById(duplicateId));
				
				if (!dryRun) {
					// Archive the duplicate company in HubSpot
					await rateLimitedCall(() => client.crm.companies.basicApi.archive(duplicateId));
					console.log(`✅ Archived HubSpot company ${duplicateId}`);
				}
				
				results.merged.push({
					id: duplicateId,
					name: duplicate.properties?.name || 'Unknown',
					success: true
				});
			} catch (err) {
				console.error(`💥 Failed to merge HubSpot company ${duplicateId}:`, err.message);
				results.errors.push(`Failed to merge HubSpot company ${duplicateId}: ${err.message}`);
			}
		}
	} catch (err) {
		console.error(`💥 Failed to get primary HubSpot company ${primaryHubSpotId}:`, err.message);
		results.errors.push(`Failed to get primary company: ${err.message}`);
	}
	
	return results;
}

module.exports = {
	ensureSchema,
	getClient,
	upsertCompany,
	upsertContact,
	associateContactToCompany,
	cleanupHubSpotDuplicates,
	searchObjectByProperty,
	findAllDuplicateCompanies,
	findHubSpotDuplicatesForCSCartCompanies,
	mergeHubSpotCompanies,
};


