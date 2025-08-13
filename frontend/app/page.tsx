'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Badge, Container, Group, Select, TextInput, Title, Card, Stack, Text, ActionIcon, Divider, Center, ScrollArea, Box, Code } from '@mantine/core';
import { ArrowLeft, ArrowRight, Link as LinkIcon, Volume2, VolumeX } from 'lucide-react';
import Mermaid from './components/Mermaid';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

type CodeBlock = { language?: string|null; content: string };
type Slide = { id: string; title: string; body: string; image?: string | null; diagram?: string | null; code?: CodeBlock | null };
type Deck = { id: string; topic: string; level: string; slides: Slide[] };

type Usage = { used: number; limit: number };

async function getUsage(): Promise<Usage> {
	const r = await fetch(`${API}/api/usage`);
	return r.json();
}

export default function Page() {
	const [topic, setTopic] = useState('');
	const [level, setLevel] = useState<string | null>('beginner');
	const [deck, setDeck] = useState<Deck | null>(null);
	const [index, setIndex] = useState(0);
	const [usage, setUsage] = useState<Usage>({ used: 0, limit: 3 });
	const [speaking, setSpeaking] = useState(false);
	const speakRef = useRef<SpeechSynthesisUtterance | null>(null);

	useEffect(() => { getUsage().then(setUsage).catch(() => {}); }, []);
	useEffect(() => {
		const id = new URL(window.location.href).searchParams.get('id');
		if (!id) return;
		fetch(`${API}/api/decks/${id}`).then(r => r.ok ? r.json() : null).then(d => { if (d) { setDeck(d); setIndex(0); } });
	}, []);

	const current = useMemo(() => deck?.slides[index] || null, [deck, index]);

	const generate = async () => {
		if (!topic) return;
		const r = await fetch(`${API}/api/decks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic, level }) });
		if (r.status === 429) return alert('Daily limit reached. Sign in for more uses.');
		const d = await r.json();
		setDeck(d); setIndex(0);
		const url = new URL(window.location.href); url.searchParams.set('id', d.id); history.replaceState({}, '', url.toString());
		getUsage().then(setUsage).catch(() => {});
	};

	const ask = async (q: string) => {
		if (!deck || !q) return;
		const payload = { question: q, slide_index: index + 1 };
		const r = await fetch(`${API}/api/decks/${deck.id}/slides`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
		if (r.status === 429) return alert('Daily limit reached. Sign in for more uses.');
		const d = await r.json();
		setDeck(d); setIndex(Math.min(index + 1, d.slides.length - 1));
		getUsage().then(setUsage).catch(() => {});
	};

	const toggleSpeak = () => {
		if (!current) return;
		const synth = window.speechSynthesis;
		if (!synth) return;
		if (speaking) { synth.cancel(); setSpeaking(false); speakRef.current = null; return; }
		const u = new SpeechSynthesisUtterance(`${current.title}. ${current.body}`);
		u.onend = () => { setSpeaking(false); };
		speakRef.current = u; setSpeaking(true); synth.speak(u);
	};

	return (
		<Container size="lg" pt="md">
			<Group justify="space-between" align="center">
				<Group>
					<Title order={3} c="blue.3">KnowDeck</Title>
					<TextInput placeholder="Ask anything to learn…" value={topic} onChange={(e) => setTopic(e.currentTarget.value)} w={360} radius="md" />
					<Select data={[{ value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'advanced', label: 'Advanced' }]} value={level} onChange={setLevel} w={160} radius="md" />
					<Button radius="md" onClick={generate}>Generate</Button>
					<Badge variant="light">uses: {usage.used}/{usage.limit}</Badge>
				</Group>
				<Group>
					<Button variant="light" radius="md" leftSection={<LinkIcon size={16} />} onClick={() => { if (!deck) return; navigator.clipboard.writeText(window.location.href); }}>Copy link</Button>
					<Button variant="default" radius="md">Sign in</Button>
					<Button variant="default" radius="md">Sign out</Button>
				</Group>
			</Group>

			<Divider my="md" />

			{!deck && (
				<Center h={360}><Text c="dimmed">Type a topic above to generate a deck.</Text></Center>
			)}

			{deck && (
				<Stack align="center" gap="xs">
					<Card withBorder radius="lg" shadow="sm" w="100%" style={{ background: '#fff', position: 'relative' }}>
						<Group justify="space-between" align="start">
							<Title order={3} c="dark.9">{current?.title}</Title>
							<Text size="sm" c="gray.5">{index + 1} / {deck.slides.length}</Text>
						</Group>
						{current?.diagram && (
							<Box mt="xs">
								<Mermaid code={current.diagram} />
							</Box>
						)}
						<ScrollArea.Autosize mah={300} mt="xs">
							<Text c="dark.8" style={{ whiteSpace: 'pre-wrap' }}>{current?.body}</Text>
						</ScrollArea.Autosize>
						{current?.code?.content && (
							<Box mt="sm" style={{ background: '#0f172a', color: '#e2e8f0', borderRadius: 8, padding: 12, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>
								<Text size="xs" c="gray.4">{current?.code?.language || 'code'}</Text>
								<pre style={{ margin: 0, overflowX: 'auto' }}><code>{current.code.content}</code></pre>
							</Box>
						)}

						<Group justify="center" mt="md">
							<ActionIcon variant="default" radius="md" onClick={() => setIndex((i) => Math.max(0, i - 1))}><ArrowLeft size={18} /></ActionIcon>
							<ActionIcon variant="default" radius="md" onClick={() => setIndex((i) => Math.min((deck?.slides.length || 1) - 1, i + 1))}><ArrowRight size={18} /></ActionIcon>
						</Group>

						<Box style={{ position: 'absolute', left: 16, bottom: 16 }}>
							<ActionIcon size="lg" radius="xl" variant="light" color="blue" onClick={toggleSpeak}>
								{speaking ? <VolumeX size={18} /> : <Volume2 size={18} />}
							</ActionIcon>
						</Box>
					</Card>

					<Group justify="center" gap={6}>
						{deck.slides.map((_, i) => (
							<ActionIcon key={i} size="xs" radius="xl" variant={i === index ? 'filled' : 'outline'} onClick={() => setIndex(i)} />
						))}
					</Group>

					<Group>
						<TextInput placeholder="Ask a question to add a new slide…" onKeyDown={(e) => { if (e.key === 'Enter') ask((e.target as HTMLInputElement).value); }} w={520} radius="md" />
						<Button radius="md" onClick={() => {
							const el = document.querySelector<HTMLInputElement>('input[placeholder^="Ask a question"]');
							if (el) ask(el.value);
						}}>Add</Button>
					</Group>
				</Stack>
			)}
		</Container>
	);
} 