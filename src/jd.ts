import { Page } from "playwright";
import fs from "fs";
import path from "path";
import { LLM } from "./llm.js";
import { AnalyzedJD, Job } from "./types.js";

/**
 * Extract the most likely job description text from the page.
 * Uses a set of common selectors + fallback to body text.
 */
export async function extractJobDescription(page: Page): Promise<string> {
  const selectors = [
    // Lever
    '.section.page-centered',
    '.posting-page',
    '.posting-page .content',
    '.posting-page .section',
    '[data-qa="job-description"]',
    '[data-qa*="description" i]',
    '[class*="posting-description" i]',

    // Greenhouse and other career sites
    '[data-testid*="job-description" i]',
    '[data-testid*="description" i]',
    '[id*="job-description" i]',
    '[id*="jobDescription" i]',
    '[class*="job-description" i]',
    '[class*="jobDescription" i]',
    '[class*="job_description" i]',
    '[class*="description" i]',
    '[class*="job-details" i]',
    '[class*="jobDetails" i]',
    'article',
    '[role="main"]',
    'main',
  ];

  const candidates: string[] = [];

  // Allow dynamically rendered career pages to populate.
  try {
    await page.waitForLoadState("networkidle", { timeout: 8000 });
  } catch {
    // Some career pages never become completely idle.
  }

  await page.waitForTimeout(1000);

  for (const selector of selectors) {
    try {
      const elements = page.locator(selector);
      const count = Math.min(await elements.count(), 12);

      for (let i = 0; i < count; i++) {
        try {
          const text = await elements.nth(i).innerText({ timeout: 3000 });
          const cleaned = cleanText(text);

          if (cleaned.length >= 300) {
            candidates.push(cleaned);
          }
        } catch {
          // Try the next candidate.
        }
      }
    } catch {
      // Try the next selector.
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.length - a.length);
    return candidates[0].slice(0, 15000);
  }

  // JSON-LD fallback. Many job pages expose jobPosting.description here.
  try {
    const descriptions = await page.locator(
      'script[type="application/ld+json"]'
    ).evaluateAll((scripts) =>
      scripts.map((script) => {
        try {
          const parsed = JSON.parse(script.textContent || "{}");
          const values = Array.isArray(parsed) ? parsed : [parsed];

          return values
            .map((item) =>
              typeof item?.description === "string" ? item.description : ""
            )
            .filter(Boolean)
            .join("\n");
        } catch {
          return "";
        }
      })
    );

    const structured = descriptions
      .map(cleanText)
      .filter((text) => text.length >= 300)
      .sort((a, b) => b.length - a.length)[0];

    if (structured) {
      return structured.slice(0, 15000);
    }
  } catch {
    // Continue to body fallback.
  }

  // Last resort: visible body text.
  try {
    const body = await page.locator("body").innerText({ timeout: 5000 });
    const cleaned = cleanText(body);

    if (cleaned.length >= 300) {
      return cleaned.slice(0, 15000);
    }
  } catch {
    // Fall through to explicit error.
  }

  throw new Error(
    "Could not extract a usable job description (less than 300 characters)."
  );
}

function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function analyzeJD(
  llm: LLM,
  rawText: string,
  job: Job
): Promise<AnalyzedJD> {
  const prompt = `You are an expert technical recruiter and ATS specialist.
Analyze the following job description and return a strict JSON object with these exact keys:

{
  "requiredSkills": string[],       // must-have technical & soft skills
  "preferredSkills": string[],      // nice-to-have skills
  "keywords": string[],             // important ATS keywords / phrases (max 25)
  "experienceYears": number | null, // minimum years if mentioned
  "summary": string                 // 2-3 sentence neutral summary of the role
}

Rules:
- Be precise. Only include skills actually mentioned or strongly implied.
- Keywords should be the exact phrases that would help pass ATS filters.
- If years of experience are not mentioned, set experienceYears to null.
- Return ONLY valid JSON, no markdown, no commentary.

Job Title (if known): ${job.title || "Unknown"}
Job Notes: ${job.notes || "None"}

JOB DESCRIPTION:
"""
${rawText}
"""`;

  const response = await llm.chat(
    [
      { role: "system", content: "You output only valid JSON." },
      { role: "user", content: prompt },
    ],
    { temperature: 0.2, json: true }
  );

  let parsed: AnalyzedJD;
  try {
    parsed = JSON.parse(response);
  } catch {
    // One retry with a stricter reminder
    const retry = await llm.chat(
      [
        { role: "system", content: "You output only valid JSON. No other text." },
        { role: "user", content: prompt },
      ],
      { temperature: 0.1, json: true }
    );
    parsed = JSON.parse(retry);
  }

  parsed.rawTextPreview = rawText.slice(0, 500);
  return parsed;
}

export function saveAnalysis(
  analyzedDir: string,
  jobId: string,
  analysis: AnalyzedJD
): string {
  const filePath = path.join(analyzedDir, `${jobId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(analysis, null, 2), "utf-8");
  return filePath;
}
