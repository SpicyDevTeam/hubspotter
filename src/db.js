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

async function fetchCompanies(pool, { pageSize, companyIds, includeCounts = true }) {
	const where = [];
	const params = [];
	if (companyIds && companyIds.length > 0) {
		where.push(`c.company_id IN (${companyIds.map(() => '?').join(',')})`);
		params.push(...companyIds);
	}
	const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
	
	let sql;
	if (includeCounts) {
		sql = `
			SELECT 
				c.company_id, c.company, c.email, c.url, c.phone, c.city, c.state, c.country, c.zipcode, c.address, c.timestamp,
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
			${whereSql}
			ORDER BY c.company_id ASC
			LIMIT ? OFFSET ?
		`;
	} else {
		// Fast query without counts for preview
		sql = `
			SELECT company_id, company, email, url, phone, city, state, country, zipcode, address, timestamp,
				   0 as product_count, 0 as order_count
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

module.exports = { createPool, fetchCompanies, fetchAdminUsersForCompanies };


