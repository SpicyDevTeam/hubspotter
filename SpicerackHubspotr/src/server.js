'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const { config } = require('./config');
const { createPool, fetchCompanies } = require('./db');
const { runSync } = require('./syncRunner');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname, 'ui.html'));
});

app.get('/api/companies', async (req, res) => {
	try {
		const pool = await createPool();
		const ids = (req.query.ids || '')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
			.map((n) => Number(n))
			.filter((n) => Number.isFinite(n));
		const companies = await fetchCompanies(pool, { pageSize: config.pageSize, companyIds: ids.length ? ids : undefined });
		await pool.end();
		res.json({ ok: true, count: companies.length, data: companies });
	} catch (err) {
		res.status(500).json({ ok: false, error: err.message });
	}
});

app.post('/api/sync', async (req, res) => {
	const dryRun = Boolean(req.body?.dryRun ?? config.dryRun);
	const companyIds = Array.isArray(req.body?.companyIds) ? req.body.companyIds : undefined;
	const events = [];
	try {
		const result = await runSync({ dryRun, companyIds }, (e) => events.push(e));
		res.json({ ok: true, result, events });
	} catch (err) {
		res.status(500).json({ ok: false, error: err.message, events });
	}
});

app.listen(config.serverPort, () => {
	console.log(`Server running on http://localhost:${config.serverPort}`);
});


