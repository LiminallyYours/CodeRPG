#!/usr/bin/env python3
"""Drive a real interactive Claude Code session in a pseudo-terminal and capture what it draws.

    python3 tools/play.py <game dir> '<steps JSON>' [--trust] [--cols 170] [--rows 55] [--model sonnet]
                          [--out capture.txt] [--grep PATTERN ...]

<steps JSON> is a list of [seconds to wait, text to type or null], e.g.
    '[[12, "/newgame\\r"], [75, "I walk north into the tavern.\\r"], [60, null]]'
("\\r" is Enter). The session runs `claude --plugin-dir ./mod` in <game dir>.

Use a scratch COPY of the project as <game dir>, so test turns don't touch your real save:
    cp -R CodeRPG /tmp/rpg-test && python3 rules/rpg.py newgame   (run inside the copy)
--trust answers Claude Code's "do you trust this folder?" prompt for a folder it hasn't seen.

The capture is the raw terminal stream with escape codes stripped. It holds every frame, so search it
(--grep) for things that must or must never appear (e.g. "rpg\\.py" leaking). Turns cost real tokens.
"""
import argparse
import fcntl
import json
import os
import pty
import re
import select
import struct
import sys
import termios
import time

ap = argparse.ArgumentParser()
ap.add_argument("dir")
ap.add_argument("steps")
ap.add_argument("--trust", action="store_true")
ap.add_argument("--cols", type=int, default=170)
ap.add_argument("--rows", type=int, default=55)
ap.add_argument("--model", default="sonnet")
ap.add_argument("--out", default=None)
ap.add_argument("--grep", nargs="*", default=[])
a = ap.parse_args()
steps = json.loads(a.steps)
if a.trust:
    steps = [[8, "\x1b[B"], [1, "\r"]] + steps  # arrow down to "Yes, I trust this folder", then Enter

pid, fd = pty.fork()
if pid == 0:
    os.chdir(a.dir)
    os.environ["TERM"] = "xterm-256color"
    os.execvp("claude", ["claude", "--plugin-dir", "./mod", "--model", a.model])
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", a.rows, a.cols, 0, 0))

buf = b""


def pump(seconds):
    global buf
    end = time.time() + seconds
    while time.time() < end:
        ready, _, _ = select.select([fd], [], [], 0.2)
        if ready:
            try:
                buf += os.read(fd, 65536)
            except OSError:
                return


for wait, text in steps:
    pump(wait)
    if text is not None:
        for ch in text:
            os.write(fd, ch.encode())
            time.sleep(0.03)
pump(2)
try:
    os.kill(pid, 9)
except OSError:
    pass

raw = buf.decode("utf-8", "replace")
text = re.sub(r"\x1b\[[0-9;?<>=]*[A-Za-z]|\x1b\][^\x07]*\x07|\x1b[()][A-Za-z0-9]|\x1b[=>78]", " ", raw)
text = re.sub(r" +", " ", text)
if a.out:
    with open(a.out, "w", encoding="utf-8") as f:
        f.write(text)
if a.grep:
    for pat in a.grep:
        hits = re.findall(pat, text)
        print("%-40s %4d  %s" % (pat[:40], len(hits), sorted(set(hits))[:3]))
else:
    print(text[-4000:])
