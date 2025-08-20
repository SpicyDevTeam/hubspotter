'use strict';

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { runSync } = require('./syncRunner');
const { config } = require('./config');

async function main() {
	const argv = yargs(hideBin(process.argv))
		.option('dry-run', { type: 'boolean', default: config.dryRun })
		.option('company-ids', { type: 'string', describe: 'Comma-separated company_id list' })
		.help()
		.parse();

	const dryRun = Boolean(argv['dry-run']);
	const companyIds = (argv['company-ids'] || '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
		.map((s) => Number(s))
		.filter((n) => Number.isFinite(n));

	await runSync({ dryRun, companyIds: companyIds.length ? companyIds : undefined });
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});


