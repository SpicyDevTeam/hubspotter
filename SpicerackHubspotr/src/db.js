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
		SELECT company_id, company, email, url, phone, city, state, country, zipcode, address, timestamp
		FROM cscart_companies
		${whereSql}
		ORDER BY company_id ASC
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
	// CS-Cart admin/vendor users: user_type in ('A','V'), active status, linked by company_id
	const sql = `
		SELECT user_id, user_login, email, firstname, lastname, phone, company_id
		FROM cscart_users
		WHERE status = 'A' AND user_type IN ('A','V') AND company_id IN (${placeholders})
	`;
	const [rows] = await pool.query(sql, companyIds);
	return rows || [];
}

module.exports = { createPool, fetchCompanies, fetchAdminUsersForCompanies };


