// A copy of rules/curse_vectors.json (the mod's tests can't read files); tools/test_rules.py checks the two match.
export const CURSE_VECTORS = [
  {
    "effect": "reverse_words",
    "input": "I walk north to the tavern.",
    "output": "tavern. the to north walk I"
  },
  {
    "effect": "reverse_words",
    "input": "  hello   there  ",
    "output": "there hello"
  },
  {
    "effect": "reverse_words",
    "input": "",
    "output": ""
  },
  {
    "effect": "mirror",
    "input": "Give me the lens, troll!",
    "output": "eviG em eht ,snel !llort"
  },
  {
    "effect": "word_limit 3",
    "input": "Please tell me where the lens went",
    "output": "Please tell me…"
  },
  {
    "effect": "word_limit 3",
    "input": "Go north now",
    "output": "Go north now"
  },
  {
    "effect": "word_limit 1",
    "input": "help me",
    "output": "help…"
  },
  {
    "effect": "suffix \"…over.\"",
    "input": "Where is the spare fuse?",
    "output": "Where is the spare fuse? …over."
  },
  {
    "effect": "suffix \"…over.\"",
    "input": "go  north ",
    "output": "go north …over."
  }
]
