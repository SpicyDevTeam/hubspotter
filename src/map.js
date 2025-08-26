'use strict';

function nullIfEmpty(value) {
	if (value === null || value === undefined) return null;
	const s = String(value).trim();
	return s.length === 0 ? null : s;
}

function mapCompanyRowToHubSpotProperties(row) {
	return {
		name: row.company,
		domain: nullIfEmpty(row.url || ''),
		phone: nullIfEmpty(row.phone),
		city: nullIfEmpty(row.city),
		state: nullIfEmpty(row.state),
		country: nullIfEmpty(row.country),
		zip: nullIfEmpty(row.zipcode),
		address: nullIfEmpty(row.address),
		cscart_email: nullIfEmpty(row.email),
		cscart_company_id: Number(row.company_id),
		cscart_product_count: Number(row.product_count_active || row.product_count || 0),
		cscart_order_count: Number(row.order_count || 0),
		cscart_status: row.status || 'A',
	};
}

function mapUserRowToHubSpotContactProperties(row, company) {
	const firstName = row.firstname || '';
	const lastName = row.lastname || '';
	const fullName = `${firstName} ${lastName}`.trim() || row.user_login || row.email || 'Admin User';
	
	// Convert Unix timestamp to ISO date string for HubSpot
	let lastLoginDate = null;
	if (row.last_login && row.last_login > 0) {
		lastLoginDate = new Date(row.last_login * 1000).toISOString();
	}
	
	return {
		email: nullIfEmpty(row.email) || undefined,
		firstname: nullIfEmpty(firstName) || undefined,
		lastname: nullIfEmpty(lastName) || undefined,
		phone: nullIfEmpty(row.phone) || undefined,
		jobtitle: 'Admin',
		company: company?.company || undefined,
		cscart_user_id: Number(row.user_id),
		cscart_last_login: lastLoginDate,
	};
}

module.exports = { mapCompanyRowToHubSpotProperties, mapUserRowToHubSpotContactProperties };


