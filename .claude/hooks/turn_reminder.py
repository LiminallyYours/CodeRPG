#!/usr/bin/env python3
"""UserPromptSubmit hook: before each in-game message, remind the game master of the turn procedure.

Silent for `ooc:` messages and slash commands, and for what Claude Code itself delivers as a message: a
subagent's reply (`<agent-message ...>`), a task notification, a command's output. Those aren't the
player's turns. Whatever this prints is added to the prompt's context. Turns are baseline play, so they
cost nothing from the meter.

When a curse is on the player, it also tells the game master how their words came out (the rules script
works that out, from the game's curse files): the curse changes the story, never the rules.
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
print("CodeRPG: this is an in-game action. Follow the gm-turn procedure in full, even for a short reply: "
      "start with `python3 rules/rpg.py look` (or with `move`, when the player plainly takes an open exit from the last "
      "output); characters marked [agent] speak only through their npc subagent "
      "(and record what they remember); write the narration last, and start it with the story itself, "
      "with no preface such as 'Recording..., then narrating.'")

try:
    out = subprocess.run([sys.executable, str(ROOT / "rules" / "rpg.py"), "curse-text", prompt], cwd=ROOT,
                         capture_output=True, text=True, timeout=20).stdout
    cursed = json.loads(out) if out.strip() else {}
except (OSError, subprocess.SubprocessError, ValueError):
    cursed = {}
if cursed.get("curses"):
    print("The player is under %s. Their words came out as: \u00ab%s\u00bb. What they meant: \u00ab%s\u00bb. "
          "Resolve what they meant (a cursed 'go north' still goes north). In the story, and to every character, "
          "including what you pass to an npc agent, they said the words as they came out."
          % (" and ".join(cursed["curses"]), cursed.get("text", ""), prompt))
