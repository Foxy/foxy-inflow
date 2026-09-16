# Agent skills

Inflow ships a skill for coding agents, `building-foxy-portals`. It is field notes measured against a live store and a live Webflow site — the things neither the source nor this documentation can tell you, because they are behaviour of the host rather than of the library: which origins the Customer API answers, how to get the bundle onto a page, what Webflow does to your markup at publish time, and which values the store refuses after Inflow has accepted them.

## Installing it

The skill is a directory of Markdown files in the format described at [agentskills.io](https://agentskills.io/specification). Copy it into wherever your agent keeps skills:

```bash
git clone https://github.com/Foxy/foxy-inflow.git
```

```bash
mkdir -p ~/.claude/skills && cp -r foxy-inflow/.claude/skills/building-foxy-portals ~/.claude/skills/
```

The `mkdir -p` matters. Without it `cp` treats a missing `~/.claude/skills` as the destination name and writes `SKILL.md` straight into it, which leaves the skill at the wrong path and reports no error.

`~/.claude/skills/` works for Claude Code. Several other runtimes read `~/.agents/skills/` as well — the files are the same either way.

Update it by copying again over the top. There is no plugin manifest and no marketplace, so nothing to register and nothing to keep in sync.

To scope it to one project rather than your whole machine, copy it into that project's `.claude/skills/` instead. Working inside a clone of this repository needs no install at all: the skill is already at `.claude/skills/building-foxy-portals/` and loads on its own.

## What it costs

The skill loads on demand. Its description sits in context at roughly 130 tokens; the agent pulls in the full text — about 1.2k tokens — only when a task matches. Nothing else is added until it is relevant.

## Webflow

Webflow stores agent instructions per site, at `<skill-name>/SKILL.md` with companion files beneath it, so the same directory can be written to a site with the Webflow MCP server's agent-instructions tool. The skill then travels with the site rather than with each developer's machine. Create `SKILL.md` first: the companion path is only valid underneath it.

## Editing it

`.claude/skills/building-foxy-portals/` is the only copy in this repository.
