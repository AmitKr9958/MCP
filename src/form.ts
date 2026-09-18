import { Page, Locator } from "playwright";
import { Profile } from "./types.js";
import { LLM } from "./llm.js";
import path from "path";
import fs from "fs";

/**
 * Robust form filler for common job application platforms
 * (Greenhouse, Lever, Ashby, Workday, BambooHR, custom forms, etc.)
 *
 * Strategy order for each field:
 * 1. Exact name / id / placeholder / aria-label matches
 * 2. Partial / fuzzy attribute matches
 * 3. Label text association (for="..." or wrapping label)
 * 4. Nearby text heuristics
 */
export async function fillApplicationForm(
  page: Page,
  profile: Profile,
  tailoredResumePath: string,
  tailoredResumeText: string,
  pdfPath: string | null,
  llm: LLM,
  jobTitle?: string
): Promise<void> {
  console.log("  → Filling form fields (robust mode)...");

  // ---------- 1. Basic identity fields ----------
  await fillField(page, {
    labels: ["full name", "name", "legal name", "applicant name"],
    selectors: [
      'input[name="name"]',
      'input[name="full_name"]',
      'input[name="fullName"]',
      'input[name*="name" i]',
      'input[id*="name" i]',
      'input[placeholder*="name" i]',
      'input[aria-label*="name" i]',
      'input[autocomplete="name"]',
    ],
    value: profile.fullName,
  });

  await fillField(page, {
    labels: ["first name", "firstname", "given name"],
    selectors: [
      'input[name*="first" i]',
      'input[id*="first" i]',
      'input[placeholder*="first" i]',
      'input[autocomplete="given-name"]',
    ],
    value: profile.fullName.split(" ")[0],
  });

  await fillField(page, {
    labels: ["last name", "lastname", "surname", "family name"],
    selectors: [
      'input[name*="last" i]',
      'input[id*="last" i]',
      'input[placeholder*="last" i]',
      'input[autocomplete="family-name"]',
    ],
    value: profile.fullName.split(" ").slice(1).join(" ") || profile.fullName,
  });

  await fillField(page, {
    labels: ["email", "e-mail", "email address"],
    selectors: [
      'input[type="email"]',
      'input[name*="email" i]',
      'input[id*="email" i]',
      'input[placeholder*="email" i]',
      'input[autocomplete="email"]',
    ],
    value: profile.email,
  });

  await fillField(page, {
    labels: ["phone", "telephone", "mobile", "cell"],
    selectors: [
      'input[type="tel"]',
      'input[name*="phone" i]',
      'input[id*="phone" i]',
      'input[placeholder*="phone" i]',
      'input[autocomplete="tel"]',
    ],
    value: profile.phone,
  });

  await fillField(page, {
    labels: ["linkedin", "linked-in", "linkedin url", "linkedin profile"],
    selectors: [
      'input[name*="linkedin" i]',
      'input[id*="linkedin" i]',
      'input[placeholder*="linkedin" i]',
      'input[aria-label*="linkedin" i]',
    ],
    value: profile.linkedin || "",
  });

  await fillField(page, {
    labels: ["github", "git hub", "portfolio", "website", "personal site"],
    selectors: [
      'input[name*="github" i]',
      'input[id*="github" i]',
      'input[placeholder*="github" i]',
      'input[name*="portfolio" i]',
      'input[name*="website" i]',
      'input[autocomplete="url"]',
    ],
    value: profile.github || profile.linkedin || "",
  });

  await fillField(page, {
    labels: ["location", "city", "current location", "address", "where are you based"],
    selectors: [
      'input[name*="location" i]',
      'input[id*="location" i]',
      'input[placeholder*="city" i]',
      'input[placeholder*="location" i]',
      'input[name*="city" i]',
      'input[autocomplete="address-level2"]',
    ],
    value: profile.location || "",
  });

  // ---------- 2. Cover letter / additional information ----------
  const coverLetterSelectors = [
    'textarea[name*="cover" i]',
    'textarea[id*="cover" i]',
    'textarea[placeholder*="cover" i]',
    'textarea[aria-label*="cover" i]',
    'textarea[name*="additional" i]',
    'textarea[name*="message" i]',
    'textarea[name*="comment" i]',
    'textarea[name*="why" i]',
    'textarea[placeholder*="tell us" i]',
    'textarea[placeholder*="why do you" i]',
  ];

  let coverFilled = false;
  for (const sel of coverLetterSelectors) {
    const el = page.locator(sel).first();
    if ((await el.count()) > 0 && (await el.isVisible().catch(() => false))) {
      console.log("  → Generating short cover letter...");
      const cover = await generateCoverLetter(llm, profile, tailoredResumeText, jobTitle);
      await safeFill(el, cover);
      coverFilled = true;
      break;
    }
  }

  // Fallback: largest visible textarea
  if (!coverFilled) {
    try {
      const textareas = page.locator("textarea:visible");
      const count = await textareas.count();
      if (count > 0) {
        const target = textareas.nth(count - 1);
        const cover = await generateCoverLetter(llm, profile, tailoredResumeText, jobTitle);
        await safeFill(target, cover);
        console.log("  → Filled fallback textarea with cover letter");
      }
    } catch {
      // ignore
    }
  }

  // ---------- 3. Resume / CV file upload ----------
  // Prefer PDF if available, otherwise fall back to .txt
  const fileToUpload =
    pdfPath && fs.existsSync(pdfPath)
      ? pdfPath
      : tailoredResumePath.replace(/\.md$/, ".txt");

  if (!fs.existsSync(fileToUpload) && tailoredResumePath.endsWith(".md")) {
    fs.writeFileSync(fileToUpload, tailoredResumeText, "utf-8");
  }

  const fileSelectors = [
    'input[type="file"][name*="resume" i]',
    'input[type="file"][id*="resume" i]',
    'input[type="file"][name*="cv" i]',
    'input[type="file"][id*="cv" i]',
    'input[type="file"][accept*="pdf" i]',
    'input[type="file"][accept*=".pdf" i]',
    'input[type="file"]',
  ];

  let uploaded = false;
  for (const sel of fileSelectors) {
    try {
      const el = page.locator(sel).first();
      if ((await el.count()) > 0) {
        await el.setInputFiles(fileToUpload);
        console.log(`  → Uploaded resume: ${path.basename(fileToUpload)}`);
        uploaded = true;
        break;
      }
    } catch {
      // continue
    }
  }

  if (!uploaded) {
    console.log("  ⚠️  No file input found – you may need to upload the resume manually.");
    console.log(`     PDF: ${pdfPath || "not generated"}`);
    console.log(`     MD:  ${tailoredResumePath}`);
  }

  // ---------- 4. LLM-assisted mapping for remaining / complex fields ----------
  try {
    console.log("  → Running LLM-assisted form mapper for remaining fields...");
    await llmAssistedFill(page, profile, tailoredResumeText, llm, jobTitle);
  } catch (err: any) {
    console.log(`  ⚠️  LLM form mapper skipped: ${err.message || err}`);
  }

  console.log("  → Form filling pass complete.");
}


/** Core robust field filler */
async function fillField(
  page: Page,
  opts: { labels: string[]; selectors: string[]; value: string }
): Promise<boolean> {
  if (!opts.value) return false;

  // 1. Direct selectors
  for (const sel of opts.selectors) {
    try {
      const el = page.locator(sel).first();
      if ((await el.count()) > 0 && (await el.isVisible().catch(() => false))) {
        await safeFill(el, opts.value);
        return true;
      }
    } catch {
      // try next
    }
  }

  // 2. Label association
  for (const labelText of opts.labels) {
    try {
      const label = page.locator(`label:has-text("${labelText}")`).first();
      if ((await label.count()) > 0) {
        const forId = await label.getAttribute("for");
        if (forId) {
          const input = page.locator(`#${forId}`);
          if ((await input.count()) > 0) {
            await safeFill(input, opts.value);
            return true;
          }
        }
        // label wraps the input
        const wrapped = label.locator("input, textarea").first();
        if ((await wrapped.count()) > 0) {
          await safeFill(wrapped, opts.value);
          return true;
        }
      }
    } catch {
      // continue
    }
  }

  return false;
}

async function safeFill(locator: Locator, value: string): Promise<void> {
  try {
    await locator.click({ timeout: 2000 });
    await locator.fill("");
    await locator.fill(value);
  } catch {
    try {
      await locator.type(value, { delay: 10 });
    } catch {
      // give up on this field
    }
  }
}

async function generateCoverLetter(
  llm: LLM,
  profile: Profile,
  tailoredResume: string,
  jobTitle?: string
): Promise<string> {
  const prompt = `Write a concise, professional cover letter (180-220 words) for the candidate.

Rules:
- Address it generically ("Dear Hiring Manager,")
- Highlight 2-3 strongest matching achievements from the resume
- Show genuine interest in the role without fluff
- End with a clear call to action
- Use first person
- Output ONLY the letter text, no subject line, no markdown

Candidate: ${profile.fullName}
Target role: ${jobTitle || "the open position"}

Relevant resume excerpt:
"""
${tailoredResume.slice(0, 2500)}
"""`;

  return llm.chat(
    [
      { role: "system", content: "You write concise, high-signal cover letters." },
      { role: "user", content: prompt },
    ],
    { temperature: 0.5, maxTokens: 600 }
  );
}

/**
 * Locate the primary Submit / Apply button but DO NOT click it.
 * Visually highlights it with a green outline.
 */
export async function findSubmitButton(page: Page): Promise<boolean> {
  const submitSelectors = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Submit Application")',
    'button:has-text("Submit")',
    'button:has-text("Apply Now")',
    'button:has-text("Apply")',
    'button:has-text("Send Application")',
    'button:has-text("Send")',
    '[data-testid*="submit"]',
    'button[class*="submit" i]',
    'a[class*="submit" i]',
    'button[class*="apply" i]',
  ];

  for (const sel of submitSelectors) {
    try {
      const el = page.locator(sel).first();
      if ((await el.count()) > 0 && (await el.isVisible().catch(() => false))) {
        await el.evaluate((node) => {
          (node as HTMLElement).style.outline = "3px solid #22c55e";
          (node as HTMLElement).style.outlineOffset = "2px";
        });
        return true;
      }
    } catch {
      // continue
    }
  }
  return false;
}

/**
 * LLM-assisted form mapper.
 * Extracts a cleaned HTML snippet of the form, asks the LLM for
 * selector → value mappings, then applies them.
 * Only fills fields that still appear empty.
 */
async function llmAssistedFill(
  page: Page,
  profile: Profile,
  tailoredResumeText: string,
  llm: LLM,
  jobTitle?: string
): Promise<void> {
  // Collect a compact representation of form controls
  const formSnapshot = await page.evaluate(() => {
    const controls: Array<{
      tag: string;
      type?: string;
      name?: string;
      id?: string;
      placeholder?: string;
      ariaLabel?: string;
      labelText?: string;
      value?: string;
      options?: string[];
    }> = [];

    const inputs = document.querySelectorAll("input, textarea, select");
    inputs.forEach((el) => {
      const input = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      if (
        input.type === "hidden" ||
        input.type === "submit" ||
        input.type === "button" ||
        input.type === "checkbox" ||
        input.type === "radio"
      ) {
        return;
      }

      let labelText = "";
      if (input.id) {
        const lab = document.querySelector(`label[for="${input.id}"]`);
        if (lab) labelText = lab.textContent?.trim() || "";
      }
      if (!labelText) {
        const parentLabel = input.closest("label");
        if (parentLabel) labelText = parentLabel.textContent?.trim() || "";
      }

      const entry: any = {
        tag: input.tagName.toLowerCase(),
        type: (input as HTMLInputElement).type || undefined,
        name: input.name || undefined,
        id: input.id || undefined,
        placeholder: (input as HTMLInputElement).placeholder || undefined,
        ariaLabel: input.getAttribute("aria-label") || undefined,
        labelText: labelText || undefined,
        value: (input as HTMLInputElement).value || undefined,
      };

      if (input.tagName === "SELECT") {
        entry.options = Array.from((input as HTMLSelectElement).options)
          .slice(0, 8)
          .map((o) => o.text);
      }

      controls.push(entry);
    });

    return controls.slice(0, 40); // keep prompt size reasonable
  });

  if (formSnapshot.length === 0) return;

  const availableValues = {
    fullName: profile.fullName,
    firstName: profile.fullName.split(" ")[0],
    lastName: profile.fullName.split(" ").slice(1).join(" "),
    email: profile.email,
    phone: profile.phone,
    linkedin: profile.linkedin || "",
    github: profile.github || "",
    location: profile.location || "",
    summary: profile.summary,
    skills: profile.skills.join(", "),
  };

  const prompt = `You are an expert at filling job application forms.
Given the list of form controls below and the candidate data, return a JSON array of fill instructions.

Only include fields that still appear empty or that clearly need the candidate's data.
Do NOT invent values. Use only the provided candidate data.
For select elements, pick the closest matching option text if possible.
Prefer CSS selectors that use name, id, or aria-label.

Return ONLY valid JSON of this shape:
[
  { "selector": "css-selector", "value": "string to fill", "reason": "short reason" }
]

Candidate data:
${JSON.stringify(availableValues, null, 2)}

Target role: ${jobTitle || "unknown"}

Form controls:
${JSON.stringify(formSnapshot, null, 2)}
`;

  const response = await llm.chat(
    [
      { role: "system", content: "You output only valid JSON arrays." },
      { role: "user", content: prompt },
    ],
    { temperature: 0.1, json: true, maxTokens: 2000 }
  );

  let mappings: Array<{ selector: string; value: string; reason?: string }> = [];
  try {
    const parsed = JSON.parse(response);
    mappings = Array.isArray(parsed) ? parsed : parsed.mappings || [];
  } catch {
    console.log("  ⚠️  Could not parse LLM form mapping response");
    return;
  }

  let filled = 0;
  for (const m of mappings) {
    if (!m.selector || !m.value) continue;
    try {
      const el = page.locator(m.selector).first();
      if ((await el.count()) === 0) continue;

      const current = await el.inputValue().catch(() => "");
      if (current && current.trim().length > 0) continue; // already filled

      await safeFill(el, m.value);
      filled++;
    } catch {
      // skip bad selectors
    }
  }

  if (filled > 0) {
    console.log(`  → LLM mapper filled ${filled} additional field(s)`);
  } else {
    console.log("  → LLM mapper found no extra empty fields to fill");
  }
}

