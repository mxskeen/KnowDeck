'use client';

import { useEffect, useId, useState } from 'react';
import mermaid from 'mermaid';

function stripFences(src: string): string {
	let t = src.trim();
	if (t.startsWith('```')) {
		t = t.replace(/^```(mermaid|json)?\n?/i, '');
		if (t.endsWith('```')) t = t.slice(0, -3);
	}
	return t.trim();
}

export default function Mermaid({ code }: { code: string }) {
	const [svg, setSvg] = useState<string>('');
	const id = useId().replace(/[:]/g, '');
	useEffect(() => {
		if (!code) { setSvg(''); return; }
		const graph = stripFences(code);
		mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict' });
		try {
			// Validate before rendering to avoid global error overlays
			mermaid.parse(graph);
			mermaid.render(`m${id}`, graph).then(({ svg }) => setSvg(svg)).catch(() => setSvg(''));
		} catch {
			setSvg('');
		}
	}, [code, id]);
	if (!code || !svg) return null;
	return <div dangerouslySetInnerHTML={{ __html: svg }} />;
} 