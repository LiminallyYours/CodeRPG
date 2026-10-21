"""Reads content files. Knows the file format, nothing about any particular world.

A content file is Markdown with a front-matter block between two '---' lines.
Front matter is a tiny YAML subset:

    key: value
    key:
      - list item
    key:
      sub: value

Any value may end with a condition such as "(if bridge_clear)",
"(if not grukk_defeated)" or "(if a or b and not c)". 'and' binds tighter than 'or'.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
KINDS = ("rooms", "characters", "items", "quests", "tables")

_COND = re.compile(r"^(.*?)\s*\(if\s+(.+)\)\s*$")


def _scalar(text):
    text = text.strip()
    if re.fullmatch(r"-?\d+", text):
        return int(text)
    return text


def parse(text):
    """Return (meta dict, body string)."""
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}, text
    try:
        end = lines.index("---", 1)
    except ValueError:
        raise ValueError("front matter has no closing '---'")
    meta, key = {}, None
    for raw in lines[1:end]:
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        if not raw.startswith((" ", "\t")):
            k, _, v = raw.partition(":")
            key = k.strip()
            meta[key] = _scalar(v) if v.strip() else None
            continue
        item = raw.strip()
        if key is None:
            raise ValueError("indented line with no parent key: %r" % raw)
        if item.startswith("- "):
            if meta[key] is None:
                meta[key] = []
            meta[key].append(_scalar(item[2:]))
        else:
            k, _, v = item.partition(":")
            if meta[key] is None:
                meta[key] = {}
            meta[key][k.strip()] = _scalar(v)
    return meta, "\n".join(lines[end + 1:]).strip()


def split_condition(value):
    """'trolls_hollow (if a or b)' -> ('trolls_hollow', 'a or b'); no condition -> (value, None)."""
    m = _COND.match(str(value))
    if not m:
        return str(value).strip(), None
    return m.group(1).strip(), m.group(2).strip()


def condition_holds(cond, flags):
    if cond is None:
        return True
    flags = set(flags)
    for alternative in re.split(r"\s+or\s+", cond):
        ok = True
        for term in re.split(r"\s+and\s+", alternative):
            term = term.strip()
            if term.startswith("not "):
                ok = ok and term[4:].strip() not in flags
            else:
                ok = ok and term in flags
        if ok:
            return True
    return False


def visible(values, flags):
    """Filter a list of possibly-conditional values down to the ones that apply now."""
    out = []
    for v in values or []:
        base, cond = split_condition(v)
        if condition_holds(cond, flags):
            out.append(base)
    return out


def sections(body):
    """Split a body into [(heading, text)] on '## ' headings. Text before the first heading has heading ''."""
    out, heading, buf = [], "", []
    for line in body.splitlines():
        if line.startswith("## "):
            out.append((heading, "\n".join(buf).strip()))
            heading, buf = line[3:].strip(), []
        else:
            buf.append(line)
    out.append((heading, "\n".join(buf).strip()))
    return [(h, t) for h, t in out if h or t]


def section_condition(heading):
    """'If a and not b' -> 'a and not b'; any other heading -> None."""
    m = re.match(r"^If\s+(.+)$", heading)
    return m.group(1).strip() if m else None


def path_of(kind, ident):
    return CONTENT / kind / ("%s.md" % ident)


def exists(kind, ident):
    return path_of(kind, ident).is_file()


def load(kind, ident):
    p = path_of(kind, ident)
    if not p.is_file():
        raise KeyError("no %s named %r in content/%s/" % (kind[:-1], ident, kind))
    meta, body = parse(p.read_text(encoding="utf-8"))
    meta["id"] = ident
    meta["body"] = body
    return meta


def load_world():
    meta, body = parse((CONTENT / "world.md").read_text(encoding="utf-8"))
    meta["body"] = body
    return meta


def ids(kind):
    d = CONTENT / kind
    return sorted(p.stem for p in d.glob("*.md")) if d.is_dir() else []
