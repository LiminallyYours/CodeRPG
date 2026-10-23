#!/usr/bin/env python3
"""PreToolUse guard for the worldsmith agent (Stage 8), declared in .claude/agents/worldsmith.md.

The worldsmith writes a new world in the background while the player plays. It may:
- write and edit files only inside the draft being forged (state/forge/<draft>/world/, and READY when done);
- run exactly two commands: the kit-complete check on that draft, and `rm` of one file inside it.
Everything else that writes or runs is denied, never asked: a permission prompt would land in the player's game.
Reading is left to the usual rules. For any other agent (if this guard is ever registered project-wide) it has no say.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
FORGE = ROOT / "state" / "forge"
WRITE_TOOLS = ("Write", "Edit", "MultiEdit", "NotebookEdit")


def read_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def forging():
    """The drafts being forged now: started (or resumed) this session, not stopped, not finished (rpg.py draft_status)."""
    session = (read_json(ROOT / "state" / "meter.json") or {}).get("session")
    out = []
    for d in sorted(FORGE.glob("draft_*")) if FORGE.is_dir() else []:
        info = read_json(d / "forge.json") or {}
        if re.fullmatch(r"draft_[0-9a-f]{6}", d.name) and not (d / "READY").exists() \
                and info.get("status") == "forging" and info.get("session") == session:
            out.append(d.name)
    return out


def decide(allow, reason):
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
                                             "permissionDecision": "allow" if allow else "deny",
                                             "permissionDecisionReason": reason}}))
    return 0


def inside(path, base):
    try:
        path.relative_to(base)
        return True
    except ValueError:
        return False


def main():
    try:
        event = json.load(sys.stdin)
    except ValueError:
        return decide(False, "FORGE GUARD: unreadable tool call")
    if event.get("agent_type") not in (None, "worldsmith"):
        return 0
    tool, args = event.get("tool_name", ""), event.get("tool_input") or {}
    drafts = forging()
    if tool not in WRITE_TOOLS and tool != "Bash":
        return 0
    if not drafts:
        return decide(False, "FORGE GUARD: no world is being forged now, so nothing may be written. Stop here.")
    d = drafts[0]
    world = FORGE / d / "world"
    rule = ("You may only write inside state/forge/%s/world/ (and state/forge/%s/READY when done), and run exactly "
            "`python3 rules/rpg.py validate --dir state/forge/%s/world --kit-complete` or `rm state/forge/%s/world/<file>`."
            % (d, d, d, d))
    if tool in WRITE_TOOLS:
        raw = args.get("file_path") or args.get("notebook_path") or ""
        path = (Path(event.get("cwd") or ROOT) / raw).resolve()
        if inside(path, world.resolve()) or path == (FORGE / d / "READY").resolve():
            return decide(True, "inside the draft")
        return decide(False, "FORGE GUARD: %s is outside the draft. %s" % (raw, rule))
    command = " ".join(str(args.get("command", "")).split())
    if re.fullmatch(r"python3 rules/rpg\.py validate --dir state/forge/%s/world/? --kit-complete" % d, command):
        return decide(True, "the draft's check")
    m = re.fullmatch(r"rm state/forge/%s/world/([a-z0-9_]+(?:/[a-z0-9_]+)?\.(?:md|json|txt))" % d, command)
    if m:
        return decide(True, "removing one file from the draft")
    return decide(False, "FORGE GUARD: that command isn't allowed. %s" % rule)


if __name__ == "__main__":
    sys.exit(main())
