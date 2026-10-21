#!/usr/bin/env python3
"""UserPromptSubmit hook: before each in-game message, remind the game master of the turn procedure.

Silent for `ooc:` messages and slash commands. Whatever this prints is added to the prompt's context.
"""
import json
import sys

try:
    prompt = str(json.load(sys.stdin).get("prompt", "")).strip()
except ValueError:
    sys.exit(0)
if prompt.lower().startswith("ooc:") or prompt.startswith("/"):
    sys.exit(0)
print("CodeRPG: this is an in-game action. Follow the gm-turn procedure in full, even for a short reply: "
      "start with `python3 rules/rpg.py look`; characters marked [agent] speak only through their npc subagent "
      "(and record what they remember); write the narration last, and start it with the story itself, "
      "with no preface such as 'Recording..., then narrating.'")
