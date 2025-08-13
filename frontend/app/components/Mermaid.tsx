'use client';

import { useEffect, useId, useState } from 'react';
import mermaid from 'mermaid';
import { getMermaidInit } from '../mermaidTheme';

function stripFences(src: string): string {
	let t = src.trim();
	if (t.startsWith('```')) {
		t = t.replace(/^```(mermaid|json)?\n?/i, '');
		if (t.endsWith('```')) t = t.slice(0, -3);
	}
	return t.trim();
}

function normalizeLabels(graph: string): string {
	return graph.replace(/\[(.*?)\]/g, (m, g1) => {
		if (g1.includes('(') || g1.includes(')')) {
			const inner = g1.replace(/\"/g, '\\"');
			return `["${inner}"]`;
		}
		return m;
	});
}

function collapseFunctionLikeLabels(graph: string): string {
	// Convert labels like start("Start") or start(Start) to "Start"
	const re = /(\(\(|\(|\[|\{)\s*([^\]\){}]+?)\s*(\)\)|\)|\]|\})/g;
	return graph.replace(re, (full, open, content, close) => {
		// Detect function-like pattern: word(args)
		const fn = content.match(/^([A-Za-z_][\w-]*)\s*\(\s*([\s\S]+?)\s*\)$/);
		if (!fn) return full;
		let arg = fn[2].trim();
		if (arg.startsWith('"') && arg.endsWith('"')) arg = arg.slice(1, -1);
		if (arg.startsWith("'") && arg.endsWith("'")) arg = arg.slice(1, -1);
		// Return bracket shape with quoted label for maximum compatibility
		return `["${arg.replace(/\\"/g, '"').replace(/"/g, '\\"')}"]`;
	});
}

function convertBareLinkLabels(graph: string): string {
	// 1) Convert `A -- Yes --> B` to `A -->|Yes| B`
	let g = graph.replace(/--\s*([^>|\n\r-][^>|\n\r]*?)\s*-->/g, (_m, label) => `-->|${label.trim()}|`);
	// 2) Fix `A -->|Yes|--> B` to `A -->|Yes| B`
	g = g.replace(/-->\s*\|([^|]+?)\|\s*-->/g, (_m, label) => `-->|${label.trim()}|`);
	// 3) Clean up extra spaces around arrows and nodes
	g = g.replace(/\s+-->\s*\|\s*([^|]+?)\s*\|\s+/g, ' -->|$1| ');
	// 4) Remove duplicate node references at end of lines (e.g., "A -->|Yes| B B" -> "A -->|Yes| B")
	g = g.replace(/(\s+[A-Za-z][A-Za-z0-9_:-]*)\s+\1(?=\s*$|\s*\n)/gm, '$1');
	return g;
}

function cleanQuotesInsideShapes(graph: string): string {
	// Remove stray quotes inside shape labels but preserve wrapping quotes
	return graph.replace(/(\(\(|\(|\[|\{)([^\]\){}]+?)(\)\)|\)|\]|\})/g, (m, open, inner, close) => {
		const starts = inner.startsWith('"');
		const ends = inner.endsWith('"');
		let core = inner.slice(starts ? 1 : 0, ends ? inner.length - 1 : inner.length);
		core = core.replace(/\\?"/g, '');
		return `${open}${starts ? '"' : ''}${core}${ends ? '"' : ''}${close}`;
	});
}

function classifyKind(graph: string): 'flow' | 'compare' | 'process' | 'warning' {
	const g = graph.toLowerCase();
	if (g.includes(' vs ') || g.includes('compare') || g.includes('comparison')) return 'compare';
	if (g.includes('error') || g.includes('alert') || g.includes('warning')) return 'warning';
	if (g.includes('process') || g.includes('pipeline')) return 'process';
	return 'flow';
}

const MERMAID_START = /^(\s*)(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|journey|pie|mindmap|timeline|gitGraph)\b/i;

function isMermaidSource(text: string): boolean {
	return MERMAID_START.test(text.trim());
}

function tryParseJson(text: string): unknown | null {
	try {
		if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) return null;
		return JSON.parse(text);
	} catch {
		return null;
	}
}

function extractFromObject(obj: any): string | null {
	if (!obj || typeof obj !== 'object') return null;
	const candidateKeys = [
		'flowchart', 'graph', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'stateDiagram-v2',
		'erDiagram', 'gantt', 'journey', 'pie', 'mindmap', 'timeline', 'gitGraph',
		'diagram', 'mermaid', 'code', 'content'
	];
	for (const key of candidateKeys) {
		const v = obj[key];
		if (typeof v === 'string' && isMermaidSource(v)) return v;
	}
	if (Array.isArray(obj)) {
		for (const it of obj) {
			const found = extractFromObject(it);
			if (found) return found;
		}
	} else {
		for (const k of Object.keys(obj)) {
			const v = (obj as any)[k];
			if (typeof v === 'string' && isMermaidSource(v)) return v;
			if (typeof v === 'object') {
				const found = extractFromObject(v);
				if (found) return found;
			}
		}
	}
	return null;
}

function extractGraph(input: string): { graph: string | null; reason?: string } {
	let t = stripFences(input);
	const parsed = tryParseJson(t);
	if (parsed) {
		const fromObj = extractFromObject(parsed);
		if (fromObj) return { graph: fromObj };
	}
	if (isMermaidSource(t)) return { graph: t };
	return { graph: null, reason: 'No Mermaid diagram detected' };
}

function slug(label: string): string {
	let s = (label || '').replace(/^\s+|\s+$/g, '');
	if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
	s = s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
	if (!s || /^(\d|_$)/.test(s)) s = `n_${s}`;
	return s.slice(0, 24);
}

function tightenIdShapeSpacing(graph: string): string {
	return graph.replace(/([A-Za-z][A-Za-z0-9_:-]*)\s+(\(\(|\(|\[|\{)/g, (_m, id, open) => `${id}${open}`);
}

function convertParensWithInnerParensToBrackets(graph: string): string {
	const toBracket = (label: string) => `["${label.replace(/\"/g, '\\"')}"]`;
	let g = graph;
	g = g.replace(/([A-Za-z][A-Za-z0-9_:-]*)\s*\(\(([^)]*\([^)]*[^)]*)\)\)/g, (_m, id, label) => `${id}${toBracket(label)}`);
	g = g.replace(/([A-Za-z][A-Za-z0-9_:-]*)\s*\(([^)]*\([^)]*[^)]*)\)/g, (_m, id, label) => `${id}${toBracket(label)}`);
	g = g.replace(/(^|[^A-Za-z0-9_:-])\(\(([^)]*\([^)]*[^)]*)\)\)/g, (_m, p, label) => `${p}${toBracket(label)}`);
	g = g.replace(/(^|[^A-Za-z0-9_:-])\(([^)]*\([^)]*[^)]*)\)/g, (_m, p, label) => `${p}${toBracket(label)}`);
	return g;
}

function removeDuplicateHeader(graph: string): string {
	const lines = graph.split(/\r?\n/).filter((l) => l.length > 0);
	if (lines.length >= 2) {
		const hdr = /^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|journey|pie|mindmap|timeline|gitGraph)\b/i;
	let lastHeaderIdx = -1;
		for (let i = 0; i < Math.min(lines.length, 4); i++) {
			if (hdr.test(lines[i])) lastHeaderIdx = i; else break;
		}
		if (lastHeaderIdx > 0) {
			lines.splice(0, lastHeaderIdx);
		}
	}
	return lines.join('\n');
}

function ensureNodeIds(graph: string): string {
	const lines = graph.split(/\r?\n/);
	let counter = 1;
	const used = new Set<string>();
	const skipPrefixes = /^(\s*)(subgraph\b|end\b|classDef\b|style\b|linkStyle\b|click\b|%%)/i;
	const result = lines.map((line) => {
		if (skipPrefixes.test(line)) return line;
		return line.replace(/(^|[^A-Za-z0-9_:-])(\(\([^\)]+\)\)|\([^()]+\)|\[[^\]]+\]|\{[^}]+\})/g, (m, p1, p2, offset, full) => {
			const left = full.slice(0, offset + String(p1).length);
			const idMatch = left.match(/([A-Za-z][A-Za-z0-9_:-]*)\s*$/);
			if (idMatch) {
				const beforeId = left.slice(0, left.length - idMatch[0].length);
				const id = idMatch[1];
				return `${beforeId}${id}${p2}`;
			}
			const raw = p2.slice(1, -1).replace(/^\(|^\[|^\{/, '').replace(/\)$|\]$|\}$/,'');
			let base = slug(raw) || `n${counter}`;
			let id = base;
			while (used.has(id)) { counter += 1; id = `${base}_${counter}`; }
			used.add(id);
			return `${id}${p2}`;
		});
	});
	return result.join('\n');
}

function fixBrokenFunctionLabelsInBrackets(graph: string): string {
	let g = graph;
	// [start(Start")] or [start(Start)] -> [Start]
	g = g.replace(/\[\s*[A-Za-z_][\w-]*\(\s*"?([^\)"]+)"?\s*\)\s*\]/g, '[$1]');
	// Also handle [start(Start]) where ) is before ]
	g = g.replace(/\[\s*[A-Za-z_][\w-]*\(([^\)]+)\]\)/g, '[$1]');
	// ["(Start"] -> [Start]
	g = g.replace(/\[\s*"?\(([^\)\]"]+)\)"?\s*\]/g, '[$1]');
	// Trailing or leading stray quote inside []: [Label"] or ["Label]
	g = g.replace(/\[\s*([^\]"]+)"\s*\]/g, '[$1]');
	g = g.replace(/\[\s*"([^\]]+)\s*\]/g, '[$1]');
	// Accidental double closing bracket inside label: [Start]] -> [Start]
	g = g.replace(/\[([^\]]+?)\]\]/g, '[$1]');
	// Handle malformed patterns like [start(Start]) where bracket closes before paren
	g = g.replace(/\[([^\[\]()]+)\]\)/g, '[$1]');
	return g;
}

function fixNodeIdDirectlyFollowedByNode(graph: string): string {
	// Fix cases like "A[Label1]B[Label2]" -> "A[Label1] B[Label2]"
	// This only adds space between complete nodes, not within them
	return graph.replace(/(\]|\)|\})([A-Za-z][A-Za-z0-9_:-]*[\[\(\{])/g, '$1 $2');
}

async function renderMermaid(id: string, g: string): Promise<string> {
	const { svg } = await mermaid.render(id, g);
	return svg;
}

function makeResponsiveSvg(svg: string): string {
	if (!svg) return svg;
	if (!/style=/.test(svg)) {
		svg = svg.replace('<svg ', '<svg style=\"max-width:100%;height:auto;display:block\" ');
	}
	if (!/preserveAspectRatio=/.test(svg)) {
		svg = svg.replace('<svg ', '<svg preserveAspectRatio=\"xMinYMin meet\" ');
	}
	return svg;
}

export default function Mermaid({ code }: { code: string }) {
	const [svg, setSvg] = useState<string>('');
	const [raw, setRaw] = useState<string>('');
	const [dbg, setDbg] = useState<string>('');
	const id = useId().replace(/[:]/g, '');
	useEffect(() => {
		if (!code) { setSvg(''); setRaw(''); setDbg(''); return; }
		(async () => {
			let g = '';
			const isDebug = (() => {
				try {
					if (typeof window === 'undefined') return false;
					const url = new URL(window.location.href);
					return url.searchParams.get('MERMAID_DEBUG') === '1' || url.searchParams.get('debugMermaid') === '1' || window.localStorage.getItem('MERMAID_DEBUG') === '1';
				} catch { return false; }
			})();
			const logs: string[] = [];
			try {
				const { graph } = extractGraph(code);
				if (!graph) { setSvg(''); setRaw(''); return; }
				logs.push('extracted: ' + graph);
				g = normalizeLabels(graph); logs.push('normalizeLabels: ' + g);
				g = collapseFunctionLikeLabels(g); logs.push('collapseFunctionLikeLabels: ' + g);
				g = removeDuplicateHeader(g); logs.push('removeDuplicateHeader: ' + g);
				g = convertBareLinkLabels(g); logs.push('convertBareLinkLabels: ' + g);
				g = convertParensWithInnerParensToBrackets(g); logs.push('convertParensWithInnerParensToBrackets: ' + g);
				g = cleanQuotesInsideShapes(g); logs.push('cleanQuotesInsideShapes: ' + g);
				g = tightenIdShapeSpacing(g); logs.push('tightenIdShapeSpacing: ' + g);
				g = ensureNodeIds(g); logs.push('ensureNodeIds: ' + g);
				g = fixBrokenFunctionLabelsInBrackets(g); logs.push('fixBrokenFunctionLabelsInBrackets: ' + g);
				g = fixNodeIdDirectlyFollowedByNode(g); logs.push('fixNodeIdDirectlyFollowedByNode: ' + g);
				const kind = classifyKind(g);
				const init = getMermaidInit(kind);
				mermaid.initialize(init as any);
				// @ts-ignore
				(mermaid as any).parseError = () => {};
				const attempts: string[] = [g];
				if (/^\s*flowchart\b/i.test(g)) attempts.push(g.replace(/^\s*flowchart\b/i, 'graph'));
				if (/^\s*graph\b/i.test(g)) attempts.push(g.replace(/^\s*graph\b/i, 'flowchart'));
				let out = '';
				for (const variant of attempts) {
					try {
						if (isDebug) { try { mermaid.parse(variant); logs.push('parse ok'); } catch (e: any) { logs.push('parse error: ' + (e?.message || String(e))); }
						}
						out = await renderMermaid(`m${id}`, variant); logs.push('render ok'); break;
					} catch (e: any) {
						logs.push('render error: ' + (e?.message || String(e)));
					}
				}
				out = makeResponsiveSvg(out);
				setSvg(out);
				setRaw(out ? '' : g);
			} catch (e: any) {
				logs.push('fatal: ' + (e?.message || String(e)));
				setSvg(''); setRaw(g || code);
			} finally {
				if (isDebug) { const text = logs.join('\n'); setDbg(text); try { console.debug('[Mermaid debug]', text); } catch {} }
			}
		})();
	}, [code, id]);
	if (!code) return null;
	if (svg) return <div style={{ width: '100%', overflowX: 'auto', overflowY: 'hidden' }} dangerouslySetInnerHTML={{ __html: svg }} />;
	if (raw) return (
		<div>
			<div style={{ background: '#0f172a', color: '#e2e8f0', borderRadius: 8, padding: 12, whiteSpace: 'pre', overflowX: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>{raw}</div>
			{dbg && (
				<div style={{ marginTop: 8, background: 'rgba(239,68,68,.08)', color: '#991B1B', border: '1px solid rgba(239,68,68,.35)', borderRadius: 8, padding: 8, whiteSpace: 'pre-wrap', fontSize: 12 }}>
					{dbg}
				</div>
			)}
		</div>
	);
	return null;
} 