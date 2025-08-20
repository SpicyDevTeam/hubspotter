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
	});
	return pool;
}

async function fetchCompanies(pool, { pageSize, companyIds }) {
	const where = [];
	const params = [];
	if (companyIds && companyIds.length > 0) {
		where.push(`company_id IN (${companyIds.map(() => '?').join(',')})`);
		params.push(...companyIds);
	}
	const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
	const sql = `
		SELECT 
			c.company_id, c.company, c.email, c.url, c.phone, c.city, c.state, c.country, c.zipcode, c.address, c.timestamp,
			COUNT(DISTINCT p.product_id) as product_count,
			COUNT(DISTINCT o.order_id) as order_count
		FROM cscart_companies c
		LEFT JOIN cscart_products p ON p.company_id = c.company_id
		LEFT JOIN cscart_orders o ON o.company_id = c.company_id
		${whereSql}
		GROUP BY c.company_id, c.company, c.email, c.url, c.phone, c.city, c.state, c.country, c.zipcode, c.address, c.timestamp
		ORDER BY c.company_id ASC
		LIMIT ? OFFSET ?
	`;

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


