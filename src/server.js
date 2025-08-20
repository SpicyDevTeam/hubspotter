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

// In-memory sync status to prevent duplicates
const syncState = {
	global: false,
	companies: new Set(),
};

function reserveTargets(companyIds) {
	// companyIds: undefined => full sync
	if (!companyIds || companyIds.length === 0) {
		if (syncState.global || syncState.companies.size > 0) {
			return { ok: false, reason: 'Another sync is already running', conflicts: { global: syncState.global, companies: Array.from(syncState.companies) } };
		}
		syncState.global = true;
		return { ok: true };
	}
	if (syncState.global) {
		return { ok: false, reason: 'A full sync is already running', conflicts: { global: true } };
	}
	const conflicts = companyIds.filter((id) => syncState.companies.has(id));
	if (conflicts.length > 0) {
		return { ok: false, reason: 'Some companies are already syncing', conflicts: { companies: conflicts } };
	}
	for (const id of companyIds) syncState.companies.add(id);
	return { ok: true };
}

function releaseTargets(companyIds) {
	if (!companyIds || companyIds.length === 0) {
		syncState.global = false;
		return;
	}
	for (const id of companyIds) syncState.companies.delete(id);
}

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

app.get('/api/status', (req, res) => {
	res.json({ ok: true, global: syncState.global, companies: Array.from(syncState.companies) });
});

app.post('/api/sync', async (req, res) => {
	const dryRun = Boolean(req.body?.dryRun ?? config.dryRun);
	const companyIds = Array.isArray(req.body?.companyIds) ? req.body.companyIds : undefined;
	const events = [];
	try {
		const r = reserveTargets(companyIds);
		if (!r.ok) {
			return res.status(409).json({ ok: false, error: r.reason, conflicts: r.conflicts });
		}
		const result = await runSync({ dryRun, companyIds }, (e) => events.push(e));
		res.json({ ok: true, result, events });
	} catch (err) {
		res.status(500).json({ ok: false, error: err.message, events });
	} finally {
		releaseTargets(companyIds);
	}
});

app.listen(config.serverPort, () => {
	console.log(`Server running on http://localhost:${config.serverPort}`);
});


