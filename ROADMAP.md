# Roadmap

## ✅ Completed

- Multi-job queue with persistent status tracking (`jobs/status.json`)
- CLI flags: `--status`, `--from`, `--retry`, `--skip`, `--resume`, `--help`
- Checkpoint recovery (stages: navigated → analyzed → tailored → pdf → filled)
- Robust form filling (label association, many attribute fallbacks)
- LLM-assisted form mapper (fills remaining empty fields after heuristics)
- PDF generation of tailored resume (Playwright, clean one-page layout)
- Prefer PDF upload when a file input is detected
- VS Code tasks (`.vscode/tasks.json`)

## Optional future improvements

1. Richer checkpoint payloads (store more intermediate data)
2. Better Markdown → PDF fidelity (optional external renderer)
3. Cover-letter templates & tone control
4. Lightweight VS Code extension with sidebar job list
5. Parallel job processing (advanced)
