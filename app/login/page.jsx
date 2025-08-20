'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function LoginPage() {
	const [code, setCode] = useState('');
	const [error, setError] = useState('');
	async function submit(e) {
		e.preventDefault();
		setError('');
		const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
		const json = await res.json();
		if (json.ok) window.location.href = '/';
		else setError(json.error || 'Invalid code');
	}
	return (
		<div className="min-h-screen bg-black text-green-400 flex items-center justify-center p-6">
			<div className="w-full max-w-md border border-green-700/40 rounded-lg p-6 bg-black/40">
				<div className="font-mono text-xl mb-4">// ACCESS REQUIRED</div>
				<form onSubmit={submit} className="space-y-3">
					<label className="block font-mono text-sm">ENTER ACCESS CODE</label>
					<input autoFocus value={code} onChange={(e) => setCode(e.target.value)} className="w-full bg-black text-green-300 border border-green-700/40 rounded px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-green-600" placeholder="**********" />
					<button className="w-full bg-green-600 hover:bg-green-500 text-black font-mono font-semibold py-2 rounded">LOGIN</button>
				</form>
				{error ? <div className="mt-3 text-red-400 font-mono text-sm">{error}</div> : null}
				<div className="mt-6 font-mono text-xs text-green-500/70">
					<span>system://</span>
					<span className="ml-1">await authorize()</span>
				</div>
			</div>
		</div>
	);
}


