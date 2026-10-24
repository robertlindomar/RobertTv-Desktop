#!/usr/bin/env python3
"""Empacota apenas arquivos públicos permitidos. Nunca inclui perfis ou logins."""
import sys,json,shutil,tarfile,zipfile,hashlib,os
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
TARGET=sys.argv[1] if len(sys.argv)>1 else 'linux'
if TARGET not in ('linux','windows'):raise SystemExit('Use linux ou windows')
version=json.loads((ROOT/'package.json').read_text())['version']
name=f'RobertTV-Desktop-{version}-{TARGET}-x64'
out=ROOT/'dist';out.mkdir(exist_ok=True)
stage=out/name
if stage.exists() and not (stage/'resources/app/package.json').exists():raise SystemExit('Destino existente não é um pacote gerado por este projeto.')
runtime=ROOT/'.browser'/('ecs' if TARGET=='linux' else 'ecs-windows')
if not runtime.exists():raise SystemExit('Prepare o motor com npm run runtime:install (ou -- --windows).')
shutil.copytree(runtime,stage,dirs_exist_ok=True,ignore=shutil.ignore_patterns('ROBERTTV-RUNTIME.json'))
app=stage/'resources/app';app.mkdir(parents=True,exist_ok=True)
files=['index.html','app.js','style.css','LICENSE','ASSET-CREDITS.md','desktop/main.cjs','desktop/services.cjs','desktop/home-preload.cjs','desktop/preload.cjs','desktop/toolbar.html','desktop/toolbar.css','desktop/toolbar.js','desktop/remote-server.cjs','desktop/remote-actions.cjs','remote/index.html','remote/remote.css','remote/remote.js','vendor/qrcode.cjs','vendor/qrcode-LICENSE.txt']
assets=['InterVariable.ttf','Inter-LICENSE.txt','app-icon.png','logo-light.svg','logo.svg','netflix.svg','youtube.png','prime.png','disneyplus.svg','hbomax.svg','paramountplus.svg','globoplay.svg']
files += ['assets/'+asset for asset in assets]
for rel in files:
 dest=app/rel;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(ROOT/rel,dest)
(app/'BUILD-INFO.json').write_text(json.dumps({'version':version,'platform':TARGET,'runtime':'44.9.3+wvcus'})+'\n')
(app/'package.json').write_text(json.dumps({'name':'roberttv-desktop','productName':'RobertTV Desktop','version':version,'main':'desktop/main.cjs','license':'MIT'},indent=2)+'\n')
shutil.copy2(ROOT/'README.md',stage/'LEIA-ME.md')
if TARGET=='linux':
 (stage/'RobertTV').write_text('''#!/usr/bin/env bash
set -euo pipefail
ROBERTTV_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROBERTTV_DIR"
exec env -u ELECTRON_RUN_AS_NODE "$ROBERTTV_DIR/electron" "$@"
''');(stage/'RobertTV').chmod(0o755)
 (stage/'instalar-icone.sh').write_text('''#!/usr/bin/env bash
set -euo pipefail
ROBERTTV_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROBERTTV_APPLICATIONS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
mkdir -p "$ROBERTTV_APPLICATIONS"
# Escreve apenas o atalho; não altera, apaga ou move dados de login.
ROBERTTV_ESCAPED="${ROBERTTV_DIR//\\\\/\\\\\\\\}"
ROBERTTV_ESCAPED="${ROBERTTV_ESCAPED//\\\"/\\\\\\\"}"
ROBERTTV_ESCAPED="${ROBERTTV_ESCAPED//\\$/\\\\\\$}"
ROBERTTV_ESCAPED="${ROBERTTV_ESCAPED//\\`/\\\\\\`}"
printf '[Desktop Entry]\\nType=Application\\nName=RobertTV Desktop\\nExec="%s/RobertTV"\\nIcon=%s/resources/app/assets/app-icon.png\\nTerminal=false\\nCategories=AudioVideo;Video;\\nStartupWMClass=roberttv-desktop\\n' "$ROBERTTV_ESCAPED" "$ROBERTTV_DIR" > "$ROBERTTV_APPLICATIONS/roberttv-desktop.desktop"
echo 'Ícone instalado. Mantenha esta pasta no mesmo lugar.'
''');(stage/'instalar-icone.sh').chmod(0o755)
 artifact=out/(name+'.tar.gz')
 with tarfile.open(artifact,'w:gz',compresslevel=6) as archive:archive.add(stage,arcname=name)
else:
 (stage/'electron.exe').rename(stage/'RobertTV.exe')
 if (stage/'electron_wer.dll').exists():(stage/'electron_wer.dll').rename(stage/'RobertTV_wer.dll')
 (stage/'Criar-atalho.ps1').write_text('''$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$Shell = New-Object -ComObject WScript.Shell
$Programs = [Environment]::GetFolderPath('Programs')
$Shortcut = $Shell.CreateShortcut((Join-Path $Programs 'RobertTV Desktop.lnk'))
$Shortcut.TargetPath = Join-Path $Root 'RobertTV.exe'
$Shortcut.WorkingDirectory = $Root
$Shortcut.Save()
Write-Host 'Atalho criado no Menu Iniciar. Mantenha esta pasta no mesmo lugar.'
''')
 artifact=out/(name+'.zip')
 with zipfile.ZipFile(artifact,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
  for file in stage.rglob('*'):
   if file.is_file():archive.write(file,arcname=str(Path(name)/file.relative_to(stage)))
# Verifica a lista real antes de disponibilizar qualquer arquivo.
for file in stage.rglob('*'):
 parts=file.relative_to(stage).parts
 if any(part in {'.runtime','.browser','node_modules','diagnostics','.git'} for part in parts):raise SystemExit('Conteúdo privado no pacote: '+str(file))
 if file.name in {'Cookies','Login Data','Local State','config.properties'}:raise SystemExit('Dados de usuário encontrados')
digest=hashlib.file_digest(artifact.open('rb'),'sha256').hexdigest()
(artifact.parent/(artifact.name+'.sha256')).write_text(digest+'  '+artifact.name+'\n')
print(json.dumps({'artifact':str(artifact),'sha256':digest,'bytes':artifact.stat().st_size},indent=2))
