# About this package

This is the Elephant-Goldfish Model (EGM) plugin for Claude Code by Google
(https://github.com/google/elephant-goldfish-model), redistributed unchanged by
kubcode.dev under the Apache License 2.0 (see `LICENSE`). It is not an
officially supported Google product.

- Upstream: `google/elephant-goldfish-model`, commit `6d2af49`, folder
  `distributions/claude` (plugin version 0.1.1). No file was modified.
- The easiest install is still the official marketplace, which also gets
  updates:

```bash
claude plugin marketplace add google/elephant-goldfish-model
claude plugin install egm@egm
```

- To use this zip instead, unpack it and start Claude Code with
  `claude --plugin-dir <unpacked folder>`. Install the whole folder: the
  skills read `agents/` and `resources/` at run time.
