'use client';

import { useEffect, useMemo, useState } from 'react';

export default function Page() {
	const [ids, setIds] = useState('');
	const [dry, setDry] = useState(true);
	const [rows, setRows] = useState([]);
	const [count, setCount] = useState('');
	const [logs, setLogs] = useState([]);
	const [status, setStatus] = useState('Idle');
	const [sortField, setSortField] = useState('company_id');
	const [sortDirection, setSortDirection] = useState('asc');

	async function refreshStatus() {
		try {
			const r = await fetch('/api/status');
			const s = await r.json();
			if (s.ok) {
				if (s.global || (s.companies && s.companies.length)) setStatus('Running');
				else setStatus('Idle');
			}
		} catch {}
	}

	async function preview() {
		setRows([]);
		setCount('Loading...');
		const res = await fetch(`/api/companies${ids.trim() ? `?ids=${encodeURIComponent(ids.trim())}` : ''}`);
		const json = await res.json();
		setCount(json.ok ? `Found ${json.count} companies` : `Error: ${json.error}`);
		if (json.ok) setRows(json.data);
	}

	async function sync(companyIds) {
		setLogs([`Running ${companyIds ? 'targeted' : 'full'} sync...`]);
		await refreshStatus();
		const res = await fetch('/api/sync', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ dryRun: !!dry, companyIds }),
		});
		const json = await res.json();
		if (json.ok)
			setLogs([`Done. Companies: ${json.result.companiesProcessed}, Users: ${json.result.usersProcessed}`, ...(json.events || [])]);
		else setLogs([`Error: ${json.error}`, ...(json.events || [])]);
		await refreshStatus();
	}

	const sortedRows = useMemo(() => {
		if (!rows.length) return [];
		
		return [...rows].sort((a, b) => {
			let aVal = a[sortField];
			let bVal = b[sortField];
			
			// Handle numeric fields
			if (sortField === 'company_id' || sortField === 'product_count' || sortField === 'order_count') {
				aVal = Number(aVal) || 0;
				bVal = Number(bVal) || 0;
			} else {
				// Handle string fields
				aVal = String(aVal || '').toLowerCase();
				bVal = String(bVal || '').toLowerCase();
			}
			
			if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
			if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
			return 0;
		});
	}, [rows, sortField, sortDirection]);

	const handleSort = (field) => {
		if (sortField === field) {
			setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
		} else {
			setSortField(field);
			setSortDirection('asc');
		}
	};

	const SortableHeader = ({ field, children }) => (
		<th 
			className="text-left font-medium px-3 py-2 cursor-pointer hover:bg-gray-200 select-none"
			onClick={() => handleSort(field)}
		>
			<div className="flex items-center gap-1">
				{children}
				<span className="text-gray-400">
					{sortField === field ? (
						sortDirection === 'asc' ? '↑' : '↓'
					) : (
						'↕'
					)}
				</span>
			</div>
		</th>
	);

	useEffect(() => {
		refreshStatus();
	}, []);

	return (
		<div className="max-w-6xl mx-auto p-6">
			<div className="flex items-center justify-between mb-6">
				<h2 className="text-2xl font-semibold">CS-Cart → HubSpot Sync</h2>
				<span className={`text-xs px-2.5 py-1 rounded ${status === 'Running' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{status}</span>
			</div>

			<div className="flex flex-wrap gap-3 items-center mb-4">
				<label className="text-sm">Company IDs</label>
				<input value={ids} onChange={(e) => setIds(e.target.value)} placeholder="e.g. 1,2,3" className="border rounded px-3 py-2 text-sm w-72" />
				<label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={dry} onChange={(e) => setDry(e.target.checked)} className="accent-emerald-600" /> Dry-run</label>
				<button onClick={preview} className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-white text-sm">Preview Companies</button>
				<button onClick={() => sync(undefined)} className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-sm">Run Full Sync</button>
			</div>

			<div className="bg-white rounded border shadow-sm">
				<div className="px-4 py-3 border-b flex items-center justify-between">
					<strong>Companies Preview</strong>
					<div className="text-sm text-gray-600">{count}</div>
				</div>
				<div className="overflow-x-auto">
					<table className="min-w-full text-sm">
						<thead className="bg-gray-100 text-gray-700">
							<tr>
								<SortableHeader field="company_id">ID</SortableHeader>
								<SortableHeader field="company">Name</SortableHeader>
								<SortableHeader field="email">Email</SortableHeader>
								<SortableHeader field="phone">Phone</SortableHeader>
								<SortableHeader field="city">City</SortableHeader>
								<SortableHeader field="product_count">Products</SortableHeader>
								<SortableHeader field="order_count">Orders</SortableHeader>
								<th className="text-right font-medium px-3 py-2">Actions</th>
							</tr>
						</thead>
						<tbody>
							{sortedRows.map((c) => (
								<tr key={c.company_id}>
									<td className="px-3 py-2">{c.company_id}</td>
									<td className="px-3 py-2">{c.company}</td>
									<td className="px-3 py-2">{c.email || ''}</td>
									<td className="px-3 py-2">{c.phone || ''}</td>
									<td className="px-3 py-2">{c.city || ''}</td>
									<td className="px-3 py-2">{c.product_count || 0}</td>
									<td className="px-3 py-2">{c.order_count || 0}</td>
									<td className="px-3 py-2 text-right">
										<button onClick={() => sync([c.company_id])} className="px-3 py-1.5 rounded bg-orange-500 hover:bg-orange-400 text-white">Sync</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>

			<div className="mt-6">
				<strong className="block mb-2">Logs</strong>
				<div className="whitespace-pre-wrap bg-slate-900 text-slate-50 p-3 rounded min-h-[160px]">{logs.map((e, i) => (
					<div key={i}>{typeof e === 'string' ? e : `${e.level || 'info'}: ${e.message || ''}`}</div>
				))}</div>
			</div>
		</div>
	);
}


