import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const binary=path.join(root,'.browser',process.platform==='win32'?'ecs-windows':'ecs',process.platform==='win32'?'electron.exe':'electron');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(binary,[root,...process.argv.slice(2)],{stdio:'inherit',env});
child.on('error',()=>{console.error('Instale o motor primeiro: npm run runtime:install');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
