import { chromium, Browser, BrowserContext, Page } from "playwright";
import path from "path";
import fs from "fs";

export class BrowserController {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private userDataDir: string;

  constructor(rootDir: string) {
    this.userDataDir = path.join(rootDir, ".browser-data");
    fs.mkdirSync(this.userDataDir, { recursive: true });
  }

  async launch(): Promise<Page> {
    // Persistent context keeps cookies/login across runs
    this.context = await chromium.launchPersistentContext(this.userDataDir, {
      headless: false,
      viewport: { width: 1280, height: 900 },
      args: ["--disable-blink-features=AutomationControlled"],
      ignoreDefaultArgs: ["--enable-automation"],
    });

    // Re-use existing page or create one
    const pages = this.context.pages();
    this.page = pages.length > 0 ? pages[0] : await this.context.newPage();

    // Helpful stealth-ish settings
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    return this.page;
  }

  getPage(): Page {
    if (!this.page) throw new Error("Browser not launched. Call launch() first.");
    return this.page;
  }

  async goto(url: string): Promise<void> {
    const page = this.getPage();
    console.log(`  → Navigating to ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    // Give SPA pages a moment
    await page.waitForTimeout(1500);
  }

  async waitForUser(message: string): Promise<"continue" | "skip"> {
    console.log(`\n${message}`);
    console.log(`   Type "skip" + Enter to skip this job`);
    console.log(`   Or just press Enter to continue...\n`);

    return new Promise<"continue" | "skip">((resolve) => {
      process.stdin.once("data", (data) => {
        const input = data.toString().trim().toLowerCase();
        if (input === "skip") {
          resolve("skip");
        } else {
          resolve("continue");
        }
      });
    });
  }

  /** Detects if the current page indicates the job is expired / not found */
  async isJobExpiredOrNotFound(): Promise<boolean> {
    const page = this.getPage();
    const text = (
      await page.locator("body").innerText().catch(() => "")
    ).toLowerCase();

    const expiredSignals = [
      "job not found",
      "position has been filled",
      "no longer available",
      "this job is no longer",
      "job has expired",
      "page not found",
      "404",
      "we couldn't find that job",
      "this position is closed",
      "requisition is no longer",
      "job posting has been removed",
      "this job is closed",
      "sorry, this job is no longer available",
    ];

    return expiredSignals.some((signal) => text.includes(signal));
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
      this.page = null;
    }
  }
}
