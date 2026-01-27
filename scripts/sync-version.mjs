import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const root = process.cwd();

// 1. 读取 package.json 版本
const pkgPath = resolve(root, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const version = pkg.version;

console.log(`[version-sync] package.json version = ${version}`);

// 2. 同步到 src-tauri/Cargo.toml
const cargoPath = resolve(root, 'src-tauri', 'Cargo.toml');
let cargo = readFileSync(cargoPath, 'utf8');
cargo = cargo.replace(/^version\\s*=\\s*".*?"/m, `version = "${version}"`);
writeFileSync(cargoPath, cargo);
console.log('[version-sync] Updated Cargo.toml');

// 3. 同步到 src-tauri/tauri.conf.json
const tauriConfPath = resolve(root, 'src-tauri', 'tauri.conf.json');
const tauriConf = JSON.parse(readFileSync(tauriConfPath, 'utf8'));
tauriConf.version = version;
writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2));
console.log('[version-sync] Updated tauri.conf.json');

