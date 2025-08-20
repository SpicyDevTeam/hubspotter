export const syncState: { global: boolean; companies: Set<number> } = {
	global: false,
	companies: new Set<number>(),
};

export function reserveTargets(companyIds?: number[]) {
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

export function releaseTargets(companyIds?: number[]) {
	if (!companyIds || companyIds.length === 0) {
		syncState.global = false;
		return;
	}
	for (const id of companyIds) syncState.companies.delete(id);
}


