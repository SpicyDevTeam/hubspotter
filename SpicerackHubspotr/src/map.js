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
		email: nullIfEmpty(row.email),
		cscart_company_id: Number(row.company_id),
	};
}

function mapUserRowToHubSpotContactProperties(row, company) {
	const firstName = row.firstname || '';
	const lastName = row.lastname || '';
	const fullName = `${firstName} ${lastName}`.trim() || row.user_login || row.email || 'Admin User';
	return {
		email: nullIfEmpty(row.email) || undefined,
		firstname: nullIfEmpty(firstName) || undefined,
		lastname: nullIfEmpty(lastName) || undefined,
		phone: nullIfEmpty(row.phone) || undefined,
		jobtitle: 'Admin',
		company: company?.company || undefined,
		cscart_user_id: Number(row.user_id),
	};
}

module.exports = { mapCompanyRowToHubSpotProperties, mapUserRowToHubSpotContactProperties };


