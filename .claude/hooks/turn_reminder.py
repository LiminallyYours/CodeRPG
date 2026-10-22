#!/usr/bin/env python3
"""UserPromptSubmit hook: before each in-game message, pay the turn's price from the meter and remind the
game master of the turn procedure.

Silent for `ooc:` messages and slash commands, which cost nothing, and for what Claude Code itself delivers
as a message: a subagent's reply (`<agent-message ...>`), a task notification, a command's output. Those
aren't the player's turns. Whatever this prints is added to the prompt's context.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent

try:
    prompt = str(json.load(sys.stdin).get("prompt", "")).strip()
except ValueError:
    sys.exit(0)
SYSTEM = re.compile(r"^<(agent-message|task-notification|local-command|command-|system-reminder|teammate-message)")
if prompt.lower().startswith("ooc:") or prompt.startswith("/") or SYSTEM.match(prompt):
    sys.exit(0)
# every game-master turn costs something; the rules script keeps the meter (and says if it ran dry)
try:
    spent = subprocess.run([sys.executable, str(ROOT / "rules" / "rpg.py"), "spend", "turn"], cwd=ROOT,
                           capture_output=True, text=True, timeout=20).stdout
except (OSError, subprocess.SubprocessError):
    spent = ""
print("CodeRPG: this is an in-game action. Follow the gm-turn procedure in full, even for a short reply: "
      "start with `python3 rules/rpg.py look`; characters marked [agent] speak only through their npc subagent "
      "(and record what they remember); write the narration last, and start it with the story itself, "
      "with no preface such as 'Recording..., then narrating.'")
if "METER SPENT" in spent:
    print("The meter is spent: voice every character yourself and generate nothing new this session.")
