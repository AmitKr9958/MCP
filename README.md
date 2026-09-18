# AI Job Application Agent

Semi-automated agent that:

1. Opens each job application URL in a real browser (persistent login)
2. Waits for **you** to log in
3. Extracts & analyzes the Job Description (OpenRouter)
4. Rewrites a tailored, ATS-optimized resume from your master resume
5. Generates a clean one-page **PDF** of the tailored resume
6. Fills common form fields with robust heuristics + **LLM-assisted mapper**
7. **Stops before Submit** so you can review everything
8. Tracks status + **checkpoints** so you can skip / retry / resume from the last successful stage

---

## Quick Start

```bash
cd job-agent
npm install
npx playwright install chromium

cp .env.example .env
# → add your OpenRouter API key

# Edit with your real data:
#   profile.json
#   resume/master.md
#   jobs.json

npm start
```

---

## CLI Commands

```bash
npm start                     # Process all pending jobs
npm start -- --status         # Show status + checkpoints
npm start -- --from job-002   # Start from a specific job id
npm start -- --retry job-001  # Force full retry (clears checkpoint)
npm start -- --skip job-003   # Mark a job as skipped
npm start -- --resume job-001 # Resume a failed job from its last checkpoint
npm start -- --help           # Show help
```

Status & checkpoints are persisted in `jobs/status.json`.

---

## VS Code Integration

Open the `job-agent` folder in VS Code. Then:

- `Ctrl+Shift+B` (or `Cmd+Shift+B`) → runs **Job Agent: Run pending jobs**
- `Terminal → Run Task…` → choose:
  - Job Agent: Run pending jobs
  - Job Agent: Show status
  - Job Agent: Help
  - Job Agent: Typecheck

Tasks live in `.vscode/tasks.json`.

---

## What gets generated

| Output | Location |
|--------|----------|
| Tailored Markdown resume | `resume/tailored/<job-id>.md` |
| Tailored PDF resume | `resume/tailored/<job-id>.pdf` |
| JD analysis (JSON) | `jobs/analyzed/<job-id>.json` |
| Job status + checkpoints | `jobs/status.json` |

---

## Checkpoint Recovery

Stages that are checkpointed:

`none → navigated → analyzed → tailored → pdf → filled`

If a job fails after the “analyzed” stage, you can later run:

```bash
npm start -- --resume job-001
```

The agent will reuse the already-generated analysis / tailored resume / PDF and continue from the next stage.

---

## Features

- **Status tracking & queue** – never re-do a completed job unless you `--retry`
- **Checkpoint recovery** – resume from the last successful stage
- **Robust form filling** – label association + many attribute fallbacks
- **LLM-assisted form mapper** – after heuristics, the LLM inspects remaining empty fields and fills them
- **PDF generation** – clean one-page ATS-friendly PDF via Playwright
- **Human-in-the-loop** – you always control login and the final Submit click
- **VS Code tasks** – one-click run / status / help

---

## Project Structure

```
job-agent/
├── .vscode/tasks.json
├── src/
│   ├── index.ts      ← orchestrator + CLI + checkpoints
│   ├── config.ts
│   ├── status.ts     ← status + checkpoint tracker
│   ├── llm.ts
│   ├── browser.ts
│   ├── jd.ts
│   ├── resume.ts     ← tailor + PDF
│   ├── form.ts       ← heuristics + LLM mapper
│   └── types.ts
├── resume/master.md
├── resume/tailored/
├── jobs/analyzed/
├── jobs.json
├── profile.json
└── ROADMAP.md
```

---

## License
MIT
