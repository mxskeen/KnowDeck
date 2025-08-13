import React from 'react';
import { ColorSchemeScript, MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';

export const metadata = { title: 'KnowDeck' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<ColorSchemeScript />
			</head>
			<body>
				<MantineProvider defaultColorScheme="dark">
					{children}
				</MantineProvider>
			</body>
		</html>
	);
} 