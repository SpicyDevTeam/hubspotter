'use client';

import { useEffect, useMemo, useState } from 'react';

export default function Page() {
	const [activeTab, setActiveTab] = useState('sync');
	const [ids, setIds] = useState('');
	const [dry, setDry] = useState(true);
	const [rows, setRows] = useState([]);
	const [count, setCount] = useState('');
	const [logs, setLogs] = useState([]);
	const [status, setStatus] = useState('Idle');
	const [sortField, setSortField] = useState('company_id');
	const [sortDirection, setSortDirection] = useState('asc');
	const [statusFilter, setStatusFilter] = useState(''); // '' = all, 'A' = active, 'D' = draft
	
	// Deduplication state
	const [duplicates, setDuplicates] = useState([]);
	const [duplicateCount, setDuplicateCount] = useState('');
	const [selectedPrimary, setSelectedPrimary] = useState({});
	const [selectedForMerge, setSelectedForMerge] = useState({});
	const [mergeResults, setMergeResults] = useState(null);

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
		const params = new URLSearchParams();
		if (ids.trim()) params.set('ids', ids.trim());
		if (statusFilter) params.set('status', statusFilter);
		const queryString = params.toString();
		const res = await fetch(`/api/companies${queryString ? `?${queryString}` : ''}`);
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

	async function findDuplicates(method = 'efficient') {
		setDuplicates([]);
		setDuplicateCount('Loading...');
		setMergeResults(null);
		try {
			const url = method === 'targeted' 
				? '/api/duplicates?method=targeted&batchSize=10'
				: '/api/duplicates?method=efficient';
			
			const res = await fetch(url);
			const json = await res.json();
			setDuplicateCount(json.ok ? 
				`Found ${json.count} duplicate groups (${json.totalDuplicates} total companies) using ${json.method} method` : 
				`Error: ${json.error}`);
			if (json.ok) {
				setDuplicates(json.data);
				// Initialize selection state
				const newSelectedPrimary = {};
				const newSelectedForMerge = {};
				json.data.forEach((group, groupIndex) => {
					// Auto-select the company with most products/orders as primary
					const bestCompany = group.companies.reduce((best, current) => {
						const bestScore = (best.productCount || 0) + (best.orderCount || 0);
						const currentScore = (current.productCount || 0) + (current.orderCount || 0);
						return currentScore > bestScore ? current : best;
					});
					newSelectedPrimary[groupIndex] = bestCompany.id;
					newSelectedForMerge[groupIndex] = {};
				});
				setSelectedPrimary(newSelectedPrimary);
				setSelectedForMerge(newSelectedForMerge);
			}
		} catch (err) {
			setDuplicateCount(`Error: ${err.message}`);
		}
	}

	async function mergeDuplicates(groupIndex, dryRun = true) {
		const group = duplicates[groupIndex];
		if (!group) return;

		const primaryId = selectedPrimary[groupIndex];
		const primaryCompany = group.companies.find(c => c.id === primaryId);
		const duplicateCompanies = Object.keys(selectedForMerge[groupIndex] || {})
			.filter(id => selectedForMerge[groupIndex][id] && id !== primaryId)
			.map(id => group.companies.find(c => c.id === id))
			.filter(Boolean);

		if (!primaryCompany || duplicateCompanies.length === 0) {
			alert('Please select a primary company and at least one duplicate to merge');
			return;
		}

		try {
			const res = await fetch('/api/duplicates', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ primaryCompany, duplicateCompanies, dryRun }),
			});
			const json = await res.json();
			
			if (json.ok) {
				setMergeResults({ ...json.result, mergeType: json.mergeType });
				if (!dryRun) {
					// For CS-Cart merges, also cleanup HubSpot duplicates
					if (json.mergeType === 'cs-cart') {
						const csCartIds = duplicateCompanies.map(c => c.csCartId).filter(Boolean);
						if (csCartIds.length > 0) {
							cleanupHubSpotDuplicates(csCartIds, false);
						}
					}
					// Refresh the duplicates list after successful merge
					setTimeout(() => findDuplicates(), 1000);
				}
			} else {
				alert(`Merge failed: ${json.error}`);
			}
		} catch (err) {
			alert(`Merge failed: ${err.message}`);
		}
	}

	async function cleanupHubSpotDuplicates(companyIds, dryRun = true) {
		try {
			const res = await fetch('/api/hubspot-cleanup', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ mergedCompanyIds: companyIds, dryRun }),
			});
			const json = await res.json();
			
			if (json.ok) {
				console.log('HubSpot cleanup result:', json.result);
				// You could show this result in the UI if desired
			} else {
				console.error('HubSpot cleanup failed:', json.error);
			}
		} catch (err) {
			console.error('HubSpot cleanup error:', err.message);
		}
	}

	const toggleCompanySelection = (groupIndex, companyId) => {
		setSelectedForMerge(prev => ({
			...prev,
			[groupIndex]: {
				...prev[groupIndex],
				[companyId]: !prev[groupIndex]?.[companyId]
			}
		}));
	};

	const getCompanyDisplayId = (company) => {
		if (company.source === 'cs-cart') {
			return `CS#${company.csCartId}`;
		} else if (company.source === 'hubspot') {
			return `HS#${company.hubSpotId}`;
		}
		return company.id;
	};

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

			{/* Tab Navigation */}
			<div className="mb-6">
				<nav className="flex space-x-4 border-b border-gray-200">
					<button
						onClick={() => setActiveTab('sync')}
						className={`px-4 py-2 border-b-2 font-medium text-sm ${
							activeTab === 'sync' 
								? 'border-emerald-500 text-emerald-600' 
								: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
						}`}
					>
						Company Sync
					</button>
					<button
						onClick={() => setActiveTab('duplicates')}
						className={`px-4 py-2 border-b-2 font-medium text-sm ${
							activeTab === 'duplicates' 
								? 'border-emerald-500 text-emerald-600' 
								: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
						}`}
					>
						Duplicate Cleanup
					</button>
				</nav>
			</div>

			{/* Sync Tab Content */}
			{activeTab === 'sync' && (
				<>
					<div className="flex flex-wrap gap-3 items-center mb-4">
						<label className="text-sm">Company IDs</label>
						<input value={ids} onChange={(e) => setIds(e.target.value)} placeholder="e.g. 1,2,3" className="border rounded px-3 py-2 text-sm w-72" />
						<label className="text-sm">Status</label>
						<select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border rounded px-3 py-2 text-sm">
							<option value="">All Companies</option>
							<option value="A">Active Only</option>
							<option value="D">Draft Only</option>
							<option value="S">Suspended Only</option>
						</select>
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
										<SortableHeader field="status">Status</SortableHeader>
										<SortableHeader field="email">Email</SortableHeader>
										<SortableHeader field="phone">Phone</SortableHeader>
										<SortableHeader field="city">City</SortableHeader>
										<SortableHeader field="product_count_active">Products (A)</SortableHeader>
										<SortableHeader field="product_count_draft">Products (D)</SortableHeader>
										<SortableHeader field="order_count_filtered">Orders (C+P+S)</SortableHeader>
										<th className="text-left font-medium px-3 py-2">Payments</th>
										<th className="text-right font-medium px-3 py-2">Actions</th>
									</tr>
								</thead>
								<tbody>
									{sortedRows.map((c) => (
										<tr key={c.company_id}>
											<td className="px-3 py-2">{c.company_id}</td>
											<td className="px-3 py-2">{c.company}</td>
											<td className="px-3 py-2">
												<span className={`px-2 py-1 rounded text-xs font-medium ${
													c.status === 'A' ? 'bg-green-100 text-green-800' : 
													c.status === 'D' ? 'bg-yellow-100 text-yellow-800' : 
													c.status === 'S' ? 'bg-red-100 text-red-800 line-through' :
													'bg-gray-100 text-gray-800'
												}`}>
													{c.status === 'A' ? 'Active' : 
													 c.status === 'D' ? 'Draft' : 
													 c.status === 'S' ? 'Suspended' : 
													 c.status || 'Unknown'}
												</span>
											</td>
											<td className="px-3 py-2">{c.email || ''}</td>
											<td className="px-3 py-2">{c.phone || ''}</td>
											<td className="px-3 py-2">{c.city || ''}</td>
											<td className="px-3 py-2">{c.product_count_active || 0}</td>
											<td className="px-3 py-2">{c.product_count_draft || 0}</td>
											<td className="px-3 py-2">
												<span 
													className="font-medium cursor-help" 
													title={`Complete: ${c.order_count_complete || 0}, Processing: ${c.order_count_processing || 0}, Suspended: ${c.order_count_suspended || 0}`}
												>
													{c.order_count_filtered || 0}
												</span>
											</td>
											<td className="px-3 py-2">
												<div className="flex gap-1">
													{c.stripe_connect_account_id && c.stripe_connect_account_id.trim() !== '' && (
														<span className="px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800">
															Stripe
														</span>
													)}
													{c.paypal_commerce_platform_account_id && c.paypal_commerce_platform_account_id.trim() !== '' && (
														<span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
															PayPal
														</span>
													)}
													{(!c.stripe_connect_account_id || c.stripe_connect_account_id.trim() === '') && 
													 (!c.paypal_commerce_platform_account_id || c.paypal_commerce_platform_account_id.trim() === '') && (
														<span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600">
															None
														</span>
													)}
												</div>
											</td>
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
				</>
			)}

			{/* Duplicates Tab Content */}
			{activeTab === 'duplicates' && (
				<>
					<div className="flex flex-wrap gap-3 items-center mb-4">
						<button onClick={() => findDuplicates('efficient')} className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-white text-sm">Find Duplicates (Fast)</button>
						<button onClick={() => findDuplicates('targeted')} className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm">Find Duplicates (Thorough)</button>
						<div className="text-sm text-gray-600">{duplicateCount}</div>
					</div>
					
					<div className="bg-blue-50 border border-blue-200 p-3 rounded mb-4">
						<div className="text-sm text-blue-800">
							<strong>Search Methods:</strong>
							<ul className="mt-1 ml-4 list-disc">
								<li><strong>Fast:</strong> Efficiently finds HubSpot-only companies without CS-Cart IDs</li>
								<li><strong>Thorough:</strong> Searches HubSpot for potential duplicates of each CS-Cart company (slower but more comprehensive)</li>
							</ul>
						</div>
					</div>

					{duplicates.map((group, groupIndex) => (
						<div key={groupIndex} className="bg-white rounded border shadow-sm mb-6">
							<div className="px-4 py-3 border-b">
								<div className="flex items-center justify-between">
									<div>
										<strong>Duplicate Group: "{group.normalizedName}"</strong>
										<div className="text-xs text-gray-500 mt-1">
											Sources: {group.sources.join(', ')} • {group.count} companies
										</div>
									</div>
									<div className="flex gap-2">
										<button 
											onClick={() => mergeDuplicates(groupIndex, true)} 
											className="px-3 py-1.5 rounded bg-blue-500 hover:bg-blue-400 text-white text-sm"
										>
											Preview Merge
										</button>
										<button 
											onClick={() => mergeDuplicates(groupIndex, false)} 
											className="px-3 py-1.5 rounded bg-red-500 hover:bg-red-400 text-white text-sm"
										>
											Execute Merge
										</button>
									</div>
								</div>
							</div>
							
							<div className="p-4">
								<div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
									{group.companies.map((company) => (
										<div 
											key={company.id}
											className={`p-3 border rounded ${
												selectedPrimary[groupIndex] === company.id 
													? 'border-green-500 bg-green-50' 
													: 'border-gray-200'
											}`}
										>
											<div className="flex items-start gap-2 mb-2">
												<input
													type="radio"
													name={`primary-${groupIndex}`}
													checked={selectedPrimary[groupIndex] === company.id}
													onChange={() => setSelectedPrimary(prev => ({ ...prev, [groupIndex]: company.id }))}
													className="mt-1"
												/>
												<div className="flex-1">
													<div className="font-medium">
														{getCompanyDisplayId(company)} {company.name}
														<span className={`ml-2 px-2 py-0.5 text-xs rounded ${
															company.source === 'cs-cart' 
																? 'bg-blue-100 text-blue-800' 
																: 'bg-orange-100 text-orange-800'
														}`}>
															{company.source}
														</span>
													</div>
													<div className="text-xs text-gray-500 mb-2">
														{company.email && <div>📧 {company.email}</div>}
														{company.phone && <div>📞 {company.phone}</div>}
														{company.domain && <div>🌐 {company.domain}</div>}
														{(company.city || company.state || company.country) && (
															<div>📍 {[company.city, company.state, company.country].filter(Boolean).join(', ')}</div>
														)}
													</div>
													{company.source === 'cs-cart' && (
														<div className="text-xs bg-gray-100 p-2 rounded">
															<div>Products: {company.productCount || 0}</div>
															<div>Orders: {company.orderCount || 0}</div>
														</div>
													)}
												</div>
											</div>
											
											<label className="flex items-center gap-2 text-sm">
												<input
													type="checkbox"
													checked={selectedForMerge[groupIndex]?.[company.id] || false}
													onChange={() => toggleCompanySelection(groupIndex, company.id)}
												/>
												Mark for merge
											</label>
										</div>
									))}
								</div>
							</div>
						</div>
					))}

					{mergeResults && (
						<div className="bg-white rounded border shadow-sm mt-6">
							<div className="px-4 py-3 border-b">
								<strong>Merge Results {mergeResults.dryRun ? '(Preview)' : '(Executed)'}</strong>
								<span className={`ml-2 px-2 py-0.5 text-xs rounded ${
									mergeResults.mergeType === 'cs-cart' 
										? 'bg-blue-100 text-blue-800' 
										: 'bg-orange-100 text-orange-800'
								}`}>
									{mergeResults.mergeType} merge
								</span>
							</div>
							<div className="p-4">
								<div className="mb-4">
									<strong>Primary Company:</strong> {mergeResults.primary.company_id ? `#${mergeResults.primary.company_id}` : `HS#${mergeResults.primary.id}`} {mergeResults.primary.company || mergeResults.primary.name}
								</div>
								
								{mergeResults.merged.length > 0 && (
									<div className="mb-4">
										<strong>Companies {mergeResults.dryRun ? 'would be' : 'were'} merged:</strong>
										<ul className="mt-2 space-y-1">
											{mergeResults.merged.map((merged, index) => (
												<li key={index} className="text-sm">
													#{merged.id} {merged.name}
													{mergeResults.dryRun && mergeResults.mergeType === 'cs-cart' && (
														<span className="text-gray-500">
															{' '}(Products: {merged.productCount}, Orders: {merged.orderCount}, Users: {merged.userCount})
														</span>
													)}
												</li>
											))}
										</ul>
									</div>
								)}
								
								{mergeResults.errors.length > 0 && (
									<div>
										<strong className="text-red-600">Errors:</strong>
										<ul className="mt-2 space-y-1">
											{mergeResults.errors.map((error, index) => (
												<li key={index} className="text-sm text-red-600">{error}</li>
											))}
										</ul>
									</div>
								)}
							</div>
						</div>
					)}
				</>
			)}
		</div>
	);
}


