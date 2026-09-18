import fs from "fs";
import path from "path";
import { chromium, Browser } from "playwright";
import { LLM } from "./llm.js";
import { AnalyzedJD, Profile } from "./types.js";

export async function tailorResume(
  llm: LLM,
  masterResume: string,
  analysis: AnalyzedJD,
  profile: Profile,
  jobTitle?: string
): Promise<string> {
  const prompt = `You are an expert resume writer and ATS optimization specialist.
Your task is to rewrite the candidate's master resume into a tightly tailored version for the target job.

STRICT RULES:
1. Preserve 100% truthfulness – never invent experience, companies, or metrics.
2. Mirror the language and keywords from the job description wherever the candidate has real matching experience.
3. Put the strongest matching achievements near the top of each role.
4. Keep the resume concise (ideally one page when rendered).
5. Use a clean, ATS-friendly structure with these exact section headers:
   - Summary
   - Experience
   - Education
   - Skills
6. In the Skills section, order skills so the most relevant ones for this job appear first.
7. Quantify achievements where the master resume already has numbers; do not add new numbers.
8. Output ONLY the final tailored resume in clean Markdown. No commentary, no code fences.

TARGET JOB TITLE: ${jobTitle || "Software Engineer"}

JOB ANALYSIS (use these keywords heavily where truthful):
Required Skills: ${analysis.requiredSkills.join(", ")}
Preferred Skills: ${analysis.preferredSkills.join(", ")}
Keywords: ${analysis.keywords.join(", ")}
Role Summary: ${analysis.summary}

CANDIDATE PROFILE (for reference):
Name: ${profile.fullName}
Current Summary: ${profile.summary}

MASTER RESUME:
"""
${masterResume}
"""`;

  const tailored = await llm.chat(
    [
      {
        role: "system",
        content:
          "You are a precise resume tailor. Output only the rewritten Markdown resume.",
      },
      { role: "user", content: prompt },
    ],
    { temperature: 0.4, maxTokens: 3000 }
  );

  return tailored.trim();
}

export function saveTailoredResume(
  tailoredDir: string,
  jobId: string,
  content: string
): string {
  const filePath = path.join(tailoredDir, `${jobId}.md`);
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

/**
 * Very lightweight keyword overlap score for quick feedback.
 */
export function keywordOverlapScore(
  tailored: string,
  keywords: string[]
): number {
  if (keywords.length === 0) return 0;
  const lower = tailored.toLowerCase();
  const hits = keywords.filter((k) => lower.includes(k.toLowerCase())).length;
  return Math.round((hits / keywords.length) * 100);
}

/**
 * Convert Markdown resume to a clean one-page PDF using Playwright.
 * Returns the path to the generated PDF.
 */
export async function generateResumePdf(
  markdown: string,
  outputPath: string,
  candidateName: string
): Promise<string> {
  const html = markdownToHtml(markdown, candidateName);

  // Use a fresh short-lived browser for PDF generation (does not interfere with the main session)
  const browser: Browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.pdf({
      path: outputPath,
      format: "A4",
      margin: { top: "0.6in", bottom: "0.6in", left: "0.7in", right: "0.7in" },
      printBackground: true,
    });
  } finally {
    await browser.close();
  }

  return outputPath;
}

function markdownToHtml(md: string, name: string): string {
  // Minimal, ATS-friendly Markdown → HTML converter (no external deps)
  let html = md
    // Headers
    .replace(/^### (.*$)/gim, "<h3>$1</h3>")
    .replace(/^## (.*$)/gim, "<h2>$1</h2>")
    .replace(/^# (.*$)/gim, "<h1>$1</h1>")
    // Bold / italic
    .replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    // Unordered lists
    .replace(/^\s*[-*] (.*$)/gim, "<li>$1</li>")
    // Paragraphs
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>");

  // Wrap consecutive <li> in <ul>
  html = html.replace(/(<li>.*?<\/li>)/gs, (match) => {
    return "<ul>" + match + "</ul>";
  });
  // Clean nested uls
  html = html.replace(/<\/ul>\s*<ul>/g, "");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(name)} – Resume</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Calibri", "Segoe UI", Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.35;
      color: #222;
      max-width: 100%;
    }
    h1 {
      font-size: 18pt;
      font-weight: 700;
      margin-bottom: 4px;
      color: #111;
    }
    h2 {
      font-size: 12pt;
      font-weight: 700;
      margin-top: 14px;
      margin-bottom: 6px;
      border-bottom: 1px solid #444;
      padding-bottom: 2px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    h3 {
      font-size: 11pt;
      font-weight: 600;
      margin-top: 8px;
      margin-bottom: 2px;
    }
    p { margin-bottom: 6px; }
    ul {
      margin: 2px 0 8px 18px;
      padding: 0;
    }
    li {
      margin-bottom: 3px;
    }
    strong { font-weight: 600; }
  </style>
</head>
<body>
  <p>${html}</p>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
