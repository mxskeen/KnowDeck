export type MermaidInit = {
	startOnLoad?: boolean;
	theme?: 'default' | 'dark' | 'forest' | 'neutral';
	themeVariables?: Record<string, string>;
	flowchart?: Record<string, unknown>;
};

function pickAccent(defaultHex: string): string {
	if (typeof window === 'undefined') return defaultHex;
	const stored = window.localStorage.getItem('MERMAID_ACCENT');
	return stored || defaultHex;
}

export function getMermaidInit(kind?: 'flow' | 'compare' | 'process' | 'warning'): MermaidInit {
	let stored = '';
	if (typeof window !== 'undefined') {
		stored = window.localStorage.getItem('MERMAID_THEME') || '';
	}
	const preset = (stored || '').toLowerCase();

	const accent = pickAccent(
		kind === 'compare' ? '#0EA5E9' :
		kind === 'warning' ? '#E11D48' :
		kind === 'process' ? '#7C3AED' : '#0B5FFF'
	);

	const knowdeck: MermaidInit = {
		startOnLoad: false,
		theme: 'neutral',
		themeVariables: {
			nodeBorder: accent,
			mainBkg: '#F1F5FF',
			actorBkg: '#0EA5E9',
			signalColor: '#F59E0B',
			textColor: '#0F172A',
			labelTextColor: '#334155',
			noteBkgColor: '#FEF08A',
			noteBorderColor: '#F59E0B',
			fontFamily: 'Inter, ui-sans-serif, system-ui, Segoe UI, Roboto, Helvetica, Arial',
			fontSize: '14px'
		},
		flowchart: {
			curve: 'basis',
			nodeSpacing: 50,
			rankSpacing: 60,
			htmlLabels: true
		}
	};

	if (preset === 'dark') return { ...knowdeck, theme: 'dark' };
	if (preset === 'forest') return { ...knowdeck, theme: 'forest' };
	if (preset === 'neutral' || preset === 'default') return { ...knowdeck, theme: preset as MermaidInit['theme'] };
	return knowdeck;
} 