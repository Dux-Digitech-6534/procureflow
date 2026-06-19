import { mkdirSync, copyFileSync } from 'node:fs';

// Raven pattern: the built index.html becomes the Jinja-rendered SPA entry
// served by Frappe at /procureflow (so {{ csrf_token }} is substituted).
mkdirSync('../procureflow/www', { recursive: true });
copyFileSync(
	'../procureflow/public/frontend/index.html',
	'../procureflow/www/procureflow.html',
);
console.log('copied built index.html -> procureflow/www/procureflow.html');
