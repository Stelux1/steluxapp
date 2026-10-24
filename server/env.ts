import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

// Node loads only server variables. None of these use Vite's public VITE_ prefix.
if (existsSync('.env')) loadEnvFile('.env');
