#!/usr/bin/env python3
"""UserPromptSubmit hook: before each in-game message, remind the game master of the turn procedure.

Silent for `ooc:` messages and slash commands, and for what Claude Code itself delivers as a message: a
subagent's reply (`<agent-message ...>`), a task notification, a command's output. Those aren't the
player's turns. Whatever this prints is added to the prompt's context. Turns are baseline play, so they
cost nothing from the meter.
"""
import json
import re
import sys

try:
    prompt = str(json.load(sys.stdin).get("prompt", "")).strip()
except ValueError:
    sys.exit(0)
SYSTEM = re.compile(r"^<(agent-message|task-notification|local-command|command-|system-reminder|teammate-message)")
if prompt.lower().startswith("ooc:") or prompt.startswith("/") or SYSTEM.match(prompt):
    sys.exit(0)
print("CodeRPG: this is an in-game action. Follow the gm-turn procedure in full, even for a short reply: "
      "start with `python3 rules/rpg.py look`; characters marked [agent] speak only through their npc subagent "
      "(and record what they remember); write the narration last, and start it with the story itself, "
      "with no preface such as 'Recording..., then narrating.'")
