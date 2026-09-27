#!/usr/bin/env python3
"""Install only Micro's owned files; preserve all existing environment launchers."""
import os
from pathlib import Path
import shutil
import stat

KIT=Path(__file__).resolve().parent
HOME_ROOT=Path.home()
root=HOME_ROOT/'apps/micro'
root.mkdir(parents=True,exist_ok=True)
instructions='''# Micro business environment

Micro is Samy's app-building business, separate from work/client and personal
projects. Use the installed micro-studio skill for app creation and development.
Projects each carry their own AGENTS.md so new tasks load the workflow.
Read /home/quorky/.agents/claude/CLAUDE.md before homelab operations.
Use the existing personal Git identity until Samy supplies a business identity.
Do not import client code, replace perso/work profiles or edit Hermes state.
Factory commands: micro doctor, micro init <id> --brief <json>, micro verify <id>.
LifeOS /micro is the feature, naming, design and reference studio.
'''
def owned_write(path,text):
    if path.exists() and path.read_text()!=text:
        raise RuntimeError('Preserving a differing existing file: '+str(path))
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(text)

owned_write(root/'AGENTS.md',instructions)
owned_write(root/'CLAUDE.md','@AGENTS.md\n')
canonical=HOME_ROOT/'.agents/skills/micro-studio'
canonical.mkdir(parents=True,exist_ok=True)
owned_write(canonical/'SKILL.md',(KIT/'studio-skill.md').read_text())
# This scoped install never touches ~/.hermes (protected by the LifeOS contract).
for agent in ('codex','copilot','cursor'):
    folder=HOME_ROOT/('.'+agent)/'skills'
    if folder.is_dir(): owned_write(folder/'micro-studio/SKILL.md',(KIT/'studio-skill.md').read_text())
claude=HOME_ROOT/'.claude/skills'
if claude.is_dir():
    target=claude/'micro-studio'
    if target.is_symlink() and target.resolve()!=canonical.resolve(): raise RuntimeError('Preserving existing skill link')
    if not target.exists(): target.symlink_to(canonical,target_is_directory=True)
launcher=HOME_ROOT/'.local/bin/micro'
script=f'''#!/bin/sh
if [ "$#" -eq 0 ]; then
  exec codex --cd '{root}'
fi
exec python3 '{KIT}/micro.py' "$@"
'''
owned_write(launcher,script)
launcher.chmod(0o755)
units=HOME_ROOT/'.config/systemd/user'
for name in ('micro-vulnerability-db.service','micro-vulnerability-db.timer'):
    owned_write(units/name,(KIT/name).read_text())
print('Installed Micro studio, project root and factory launcher. Perso/work and Hermes preserved.')
