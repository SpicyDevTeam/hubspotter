'use strict';

const mysql = require('mysql2/promise');
const { config } = require('./config');

async function createPool() {
	const pool = mysql.createPool({
		host: config.database.host,
		port: config.database.port,
		user: config.database.user,
		password: config.database.password,
		database: config.database.database,
		connectionLimit: Math.max(5, config.concurrency * 2),
		charset: 'utf8mb4',
		multipleStatements: false,
		acquireTimeout: 30000,
		timeout: 30000,
		reconnect: true,
	});
	return pool;
}

async function fetchCompanies(pool, { pageSize, companyIds, includeCounts = true, status = null }) {
	const where = [];
	const params = [];
	if (companyIds && companyIds.length > 0) {
		where.push(`c.company_id IN (${companyIds.map(() => '?').join(',')})`);
		params.push(...companyIds);
	}
	if (status && ['A', 'D', 'S'].includes(status)) {
		where.push(`c.status = ?`);
		params.push(status);
	}
	const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
	
	let sql;
	if (includeCounts) {
		sql = `
			SELECT 
				c.company_id, c.company, c.email, c.url, c.phone, c.city, c.state, c.country, c.zipcode, c.address, c.timestamp, c.status,
				c.stripe_connect_account_id, c.paypal_commerce_platform_account_id,
				COALESCE(sh.shipping_countries, '') as shipping_countries,
				COALESCE(p.product_count_active, 0) as product_count_active,
				COALESCE(p.product_count_draft, 0) as product_count_draft,
				COALESCE(p.product_count_total, 0) as product_count_total,
				COALESCE(o.order_count_complete, 0) as order_count_complete,
				COALESCE(o.order_count_processing, 0) as order_count_processing,
				COALESCE(o.order_count_suspended, 0) as order_count_suspended,
				COALESCE(o.order_count_filtered, 0) as order_count_filtered,
				COALESCE(o.order_count_total, 0) as order_count_total
			FROM cscart_companies c
			LEFT JOIN (
				SELECT 
					company_id, 
					SUM(CASE WHEN status = 'A' THEN 1 ELSE 0 END) as product_count_active,
					SUM(CASE WHEN status = 'D' THEN 1 ELSE 0 END) as product_count_draft,
					COUNT(*) as product_count_total
				FROM cscart_products 
				GROUP BY company_id
			) p ON p.company_id = c.company_id
			LEFT JOIN (
				SELECT 
					company_id, 
					SUM(CASE WHEN status = 'C' THEN 1 ELSE 0 END) as order_count_complete,
					SUM(CASE WHEN status = 'P' THEN 1 ELSE 0 END) as order_count_processing,
					SUM(CASE WHEN status = 'S' THEN 1 ELSE 0 END) as order_count_suspended,
					SUM(CASE WHEN status IN ('C', 'P', 'S') THEN 1 ELSE 0 END) as order_count_filtered,
					COUNT(*) as order_count_total
				FROM cscart_orders 
				GROUP BY company_id
			) o ON o.company_id = c.company_id
			LEFT JOIN (
				SELECT 
					s.company_id,
					GROUP_CONCAT(DISTINCT de.element ORDER BY de.element) as shipping_countries
				FROM cscart_shippings s
				LEFT JOIN cscart_shipping_rates sr ON sr.shipping_id = s.shipping_id
				LEFT JOIN cscart_destination_elements de ON de.destination_id = sr.destination_id
				WHERE s.status = 'A' AND de.element_type = 'C'
				GROUP BY s.company_id
			) sh ON sh.company_id = c.company_id
			${whereSql}
			ORDER BY c.company_id ASC
			LIMIT ? OFFSET ?
		`;
	} else {
		// Fast query without counts for preview
		sql = `
			SELECT company_id, company, email, url, phone, city, state, country, zipcode, address, timestamp, status,
				   stripe_connect_account_id, paypal_commerce_platform_account_id, '' as shipping_countries,
				   0 as product_count_active, 0 as product_count_draft, 0 as product_count_total, 
				   0 as order_count_complete, 0 as order_count_processing, 0 as order_count_suspended, 
				   0 as order_count_filtered, 0 as order_count_total
			FROM cscart_companies c
			${whereSql}
			ORDER BY company_id ASC
			LIMIT ? OFFSET ?
		`;
	}

	const results = [];
	let offset = 0;
	while (true) {
		const [rows] = await pool.query(sql, [...params, pageSize, offset]);
		if (!rows || rows.length === 0) break;
		results.push(...rows);
		if (rows.length < pageSize) break;
		offset += pageSize;
	}
	return results;
}

async function fetchAdminUsersForCompanies(pool, companyIds) {
	if (!companyIds || companyIds.length === 0) return [];
	const placeholders = companyIds.map(() => '?').join(',');
	const sql = `
		SELECT user_id, user_login, email, firstname, lastname, phone, company_id, last_login
		FROM cscart_users
		WHERE status = 'A' AND user_type IN ('A','V') AND company_id IN (${placeholders})
	`;
	const [rows] = await pool.query(sql, companyIds);
	return rows || [];
}

// Function to find potential duplicate companies based on name similarity
async function findDuplicateCompanies(pool) {
	const sql = `
		SELECT c.company_id, c.company, c.email, c.phone, c.city, c.state, c.country,
			   COALESCE(p.product_count, 0) as product_count,
			   COALESCE(o.order_count, 0) as order_count
		FROM cscart_companies c
		LEFT JOIN (
			SELECT company_id, COUNT(*) as product_count 
			FROM cscart_products 
			GROUP BY company_id
		) p ON p.company_id = c.company_id
		LEFT JOIN (
			SELECT company_id, COUNT(*) as order_count 
			FROM cscart_orders 
			GROUP BY company_id
		) o ON o.company_id = c.company_id
		WHERE c.company IS NOT NULL AND TRIM(c.company) != ''
		ORDER BY c.company ASC
	`;
	
	const [rows] = await pool.query(sql);
	const companies = rows || [];
	
	// Group companies by normalized name to identify potential duplicates
	const groups = new Map();
	
	for (const company of companies) {
		// Normalize company name: lowercase, remove extra spaces, remove common business suffixes
		const normalizedName = company.company
			.toLowerCase()
			.replace(/\s+/g, ' ')
			.replace(/\b(inc|corp|corporation|ltd|limited|llc|co|company)\b\.?$/g, '')
			.trim();
		
		if (!groups.has(normalizedName)) {
			groups.set(normalizedName, []);
		}
		groups.get(normalizedName).push(company);
	}
	
	// Return only groups with multiple companies (potential duplicates)
	const duplicates = [];
	for (const [normalizedName, companyGroup] of groups) {
		if (companyGroup.length > 1) {
			duplicates.push({
				normalizedName,
				companies: companyGroup,
				count: companyGroup.length
			});
		}
	}
	
	return duplicates.sort((a, b) => b.count - a.count); // Sort by number of duplicates descending
}

// Function to merge companies by updating all references to point to the primary company
async function mergeCompanies(pool, primaryCompanyId, duplicateIds, { dryRun = false } = {}) {
	if (!duplicateIds || duplicateIds.length === 0) {
		throw new Error('No duplicate company IDs provided for merging');
	}
	
	// Validate that primary company exists
	const [primaryCheck] = await pool.query(
		'SELECT company_id, company FROM cscart_companies WHERE company_id = ?',
		[primaryCompanyId]
	);
	
	if (!primaryCheck || primaryCheck.length === 0) {
		throw new Error(`Primary company ${primaryCompanyId} not found`);
	}
	
	const primary = primaryCheck[0];
	const results = {
		primary: primary,
		merged: [],
		errors: [],
		dryRun
	};
	
	for (const duplicateId of duplicateIds) {
		if (duplicateId === primaryCompanyId) {
			results.errors.push(`Cannot merge company ${duplicateId} with itself`);
			continue;
		}
		
		try {
			// Get duplicate company info
			const [duplicateCheck] = await pool.query(
				'SELECT company_id, company FROM cscart_companies WHERE company_id = ?',
				[duplicateId]
			);
			
			if (!duplicateCheck || duplicateCheck.length === 0) {
				results.errors.push(`Duplicate company ${duplicateId} not found`);
				continue;
			}
			
			const duplicate = duplicateCheck[0];
			
			if (!dryRun) {
				// Start transaction
				await pool.query('START TRANSACTION');
				
				try {
					// Update products to point to primary company
					await pool.query(
						'UPDATE cscart_products SET company_id = ? WHERE company_id = ?',
						[primaryCompanyId, duplicateId]
					);
					
					// Update orders to point to primary company  
					await pool.query(
						'UPDATE cscart_orders SET company_id = ? WHERE company_id = ?',
						[primaryCompanyId, duplicateId]
					);
					
					// Update users to point to primary company
					await pool.query(
						'UPDATE cscart_users SET company_id = ? WHERE company_id = ?',
						[primaryCompanyId, duplicateId]
					);
					
					// Delete the duplicate company record
					await pool.query('DELETE FROM cscart_companies WHERE company_id = ?', [duplicateId]);
					
					// Commit transaction
					await pool.query('COMMIT');
					
					results.merged.push({
						id: duplicateId,
						name: duplicate.company,
						success: true
					});
				} catch (err) {
					// Rollback on error
					await pool.query('ROLLBACK');
					throw err;
				}
			} else {
				// Dry run - just collect what would be merged
				const [productCount] = await pool.query(
					'SELECT COUNT(*) as count FROM cscart_products WHERE company_id = ?',
					[duplicateId]
				);
				const [orderCount] = await pool.query(
					'SELECT COUNT(*) as count FROM cscart_orders WHERE company_id = ?',
					[duplicateId]
				);
				const [userCount] = await pool.query(
					'SELECT COUNT(*) as count FROM cscart_users WHERE company_id = ?',
					[duplicateId]
				);
				
				results.merged.push({
					id: duplicateId,
					name: duplicate.company,
					productCount: productCount[0]?.count || 0,
					orderCount: orderCount[0]?.count || 0,
					userCount: userCount[0]?.count || 0,
					success: true
				});
			}
		} catch (err) {
			results.errors.push(`Failed to merge company ${duplicateId}: ${err.message}`);
		}
	}
	
	return results;
}

module.exports = { 
	createPool, 
	fetchCompanies, 
	fetchAdminUsersForCompanies,
	findDuplicateCompanies,
	mergeCompanies
};


