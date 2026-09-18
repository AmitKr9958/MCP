import { loadConfig, parseCliArgs, printHelp } from "./config.js";
import { createLLM } from "./llm.js";
import { BrowserController } from "./browser.js";
import { extractJobDescription, analyzeJD, saveAnalysis } from "./jd.js";
import {
  tailorResume,
  saveTailoredResume,
  keywordOverlapScore,
  generateResumePdf,
} from "./resume.js";
import { fillApplicationForm, findSubmitButton } from "./form.js";
import { StatusTracker } from "./status.js";
import { Job, CheckpointStage, AnalyzedJD } from "./types.js";
import path from "path";
import fs from "fs";

async function processJob(
  job: Job,
  config: ReturnType<typeof loadConfig>,
  llm: ReturnType<typeof createLLM>,
  browser: BrowserController,
  status: StatusTracker,
  resumeFrom?: CheckpointStage
): Promise<"completed" | "skipped" | "failed"> {
  console.log("\n" + "=".repeat(60));
  console.log(`JOB: ${job.title || job.id}`);
  console.log(`URL: ${job.url}`);
  if (resumeFrom && resumeFrom !== "none") {
    console.log(`♻️  Resuming from checkpoint: ${resumeFrom}`);
  }
  console.log("=".repeat(60));

  status.setStatus(job.id, "in-progress");

  const prev = status.get(job.id);
  let analysisPath = prev?.analysisPath;
  let tailoredPath = prev?.tailoredResumePath;
  let pdfPath = prev?.pdfPath;
  let analysis: AnalyzedJD | null = null;
  let tailored = "";

  const stageOrder: CheckpointStage[] = [
    "none",
    "navigated",
    "analyzed",
    "tailored",
    "pdf",
    "filled",
  ];
  const shouldRun = (stage: CheckpointStage) => {
    if (!resumeFrom || resumeFrom === "none") return true;
    return stageOrder.indexOf(stage) > stageOrder.indexOf(resumeFrom);
  };

  try {
    // 1. Navigate
    if (shouldRun("navigated") || resumeFrom === "none") {
      await browser.goto(job.url);
      status.setCheckpoint(job.id, "navigated");
    } else {
      await browser.goto(job.url);
    }

    // 2. Auto-detect expired / not found jobs
    if (await browser.isJobExpiredOrNotFound()) {
      console.log("\n⚠️  This job appears to be expired or no longer available.");
      console.log("   Automatically skipping to the next job...");
      status.setStatus(job.id, "skipped", { error: "Job expired or not found" });
      return "skipped";
    }

    // 3. Wait for user (with skip option)
    const userAction = await browser.waitForUser(
      `🔐 Please log in (if required) and navigate to the actual application form for:\n` +
        `   "${job.title || job.id}"\n` +
        `   When the form is visible and ready, press Enter here.`
    );

    if (userAction === "skip") {
      console.log("\n⏭️  You chose to skip this job.");
      status.setStatus(job.id, "skipped");
      return "skipped";
    }

    const page = browser.getPage();

    // 4. Extract + analyze JD
    if (shouldRun("analyzed")) {
      console.log("\n📄 Extracting job description...");
      const rawJD = await extractJobDescription(page);
      console.log(`   Extracted ${rawJD.length} characters`);

      console.log("🧠 Analyzing JD with LLM...");
      analysis = await analyzeJD(llm, rawJD, job);
      analysisPath = saveAnalysis(config.paths.analyzedDir, job.id, analysis);
      console.log(`   Saved analysis → ${analysisPath}`);
      status.setCheckpoint(job.id, "analyzed", { analysisPath });
    } else if (analysisPath && fs.existsSync(analysisPath)) {
      analysis = JSON.parse(fs.readFileSync(analysisPath, "utf-8"));
      console.log(`\n♻️  Reusing previous analysis → ${analysisPath}`);
    }

    if (!analysis) {
      throw new Error("No analysis available");
    }

    // 5. Tailor resume
    if (shouldRun("tailored")) {
      console.log("\n✍️  Tailoring resume...");
      tailored = await tailorResume(
        llm,
        config.masterResume,
        analysis,
        config.profile,
        job.title
      );
      tailoredPath = saveTailoredResume(
        config.paths.tailoredDir,
        job.id,
        tailored
      );
      const score = keywordOverlapScore(tailored, analysis.keywords);
      console.log(`   Saved tailored resume → ${tailoredPath}`);
      console.log(`   Keyword overlap score: ${score}%`);
      status.setCheckpoint(job.id, "tailored", {
        tailoredResumePath: tailoredPath,
      });
    } else if (tailoredPath && fs.existsSync(tailoredPath)) {
      tailored = fs.readFileSync(tailoredPath, "utf-8");
      console.log(`\n♻️  Reusing previous tailored resume → ${tailoredPath}`);
    }

    if (!tailored || !tailoredPath) {
      throw new Error("No tailored resume available");
    }

    // 6. Generate PDF
    if (shouldRun("pdf")) {
      console.log("\n📑 Generating PDF resume...");
      pdfPath = path.join(config.paths.tailoredDir, `${job.id}.pdf`);
      await generateResumePdf(tailored, pdfPath, config.profile.fullName);
      console.log(`   PDF saved → ${pdfPath}`);
      status.setCheckpoint(job.id, "pdf", { pdfPath });
    } else if (pdfPath && fs.existsSync(pdfPath)) {
      console.log(`\n♻️  Reusing previous PDF → ${pdfPath}`);
    }

    // 7. Fill form
    if (shouldRun("filled")) {
      console.log("\n📝 Filling application form...");
      await fillApplicationForm(
        page,
        config.profile,
        tailoredPath,
        tailored,
        pdfPath || null,
        llm,
        job.title
      );
      status.setCheckpoint(job.id, "filled");
    } else {
      console.log("\n♻️  Form was already filled – skipping fill step.");
    }

    // 8. Highlight submit button
    const foundSubmit = await findSubmitButton(page);
    if (foundSubmit) {
      console.log("\n✅ Submit button located and highlighted (green outline).");
    } else {
      console.log(
        "\n⚠️  Could not auto-locate a Submit button – please review the page manually."
      );
    }

    // 9. Review stage (with skip option)
    const reviewAction = await browser.waitForUser(
      `👀 REVIEW TIME\n` +
        `   - Check every field\n` +
        `   - Review the tailored resume:\n` +
        `       MD:  ${tailoredPath}\n` +
        `       PDF: ${pdfPath || "n/a"}\n` +
        `   - Click Submit yourself if everything looks good\n` +
        `   - Type "skip" if you want to abandon this application\n\n` +
        `   When you are done, press Enter to continue.`
    );

    if (reviewAction === "skip") {
      console.log("\n⏭️  You chose to skip this job at review stage.");
      status.setStatus(job.id, "skipped");
      return "skipped";
    }

    status.setStatus(job.id, "completed", {
      tailoredResumePath: tailoredPath,
      analysisPath,
      pdfPath,
      checkpoint: "filled",
    });
    return "completed";
  } catch (err: any) {
    const message = err?.message || String(err);
    console.error(`\n❌ Error processing ${job.id}:`, message);
    status.setStatus(job.id, "failed", { error: message });
    await browser.waitForUser(
      "An error occurred. Press Enter to continue to the next job, or Ctrl+C to stop.\n" +
        `You can later resume this job with:  npm start -- --resume ${job.id}`
    );
    return "failed";
  }
}

async function main() {
  const cli = parseCliArgs(process.argv);

  if (cli.help) {
    printHelp();
    return;
  }

  console.log("🚀 AI Job Application Agent");
  console.log(
    "   Status • Checkpoints • LLM form mapper • PDF • Robust filling\n"
  );

  const config = loadConfig();
  const status = new StatusTracker(config.paths.statusFile, config.jobs);

  if (cli.statusOnly) {
    status.printSummary(config.jobs);
    return;
  }

  if (cli.skipId) {
    status.setStatus(cli.skipId, "skipped");
    console.log(`⏭️  Marked ${cli.skipId} as skipped.`);
    status.printSummary(config.jobs);
    return;
  }

  if (cli.retryId) {
    status.setStatus(cli.retryId, "pending", { checkpoint: "none" });
    console.log(`🔄 Reset ${cli.retryId} to pending (full retry).`);
  }

  if (cli.resumeId) {
    const state = status.getResumable(cli.resumeId);
    if (!state) {
      console.log(
        `⚠️  Job ${cli.resumeId} has no resumable checkpoint (or does not exist).`
      );
      status.printSummary(config.jobs);
      return;
    }
    console.log(
      `♻️  Will resume ${cli.resumeId} from checkpoint: ${state.checkpoint}`
    );
  }

  const llm = createLLM(config);
  const browser = new BrowserController(config.paths.root);

  let jobsToRun = status.getPendingJobs(config.jobs, cli.fromId);

  if (cli.retryId) {
    const j = config.jobs.find((x) => x.id === cli.retryId);
    if (j && !jobsToRun.find((x) => x.id === cli.retryId)) {
      jobsToRun = [j, ...jobsToRun];
    }
  }
  if (cli.resumeId) {
    const j = config.jobs.find((x) => x.id === cli.resumeId);
    if (j && !jobsToRun.find((x) => x.id === cli.resumeId)) {
      jobsToRun = [j, ...jobsToRun];
    }
  }

  if (jobsToRun.length === 0) {
    console.log("🎉 No pending jobs left.");
    status.printSummary(config.jobs);
    return;
  }

  console.log(`Loaded ${config.jobs.length} job(s) total`);
  console.log(`Will process ${jobsToRun.length} job(s)`);
  console.log(`Model: ${config.model}`);
  console.log(`Profile: ${config.profile.fullName} <${config.profile.email}>`);

  try {
    await browser.launch();
    console.log(
      "\n🌐 Browser launched (persistent profile – logins are remembered)"
    );

    for (let i = 0; i < jobsToRun.length; i++) {
      const job = jobsToRun[i];
      console.log(`\n[${i + 1}/${jobsToRun.length}]`);

      const resumeFrom =
        cli.resumeId === job.id
          ? status.get(job.id)?.checkpoint
          : undefined;

      await processJob(job, config, llm, browser, status, resumeFrom);
    }

    console.log("\n" + "=".repeat(60));
    console.log("🏁 Batch finished.");
    status.printSummary(config.jobs);
    console.log("\nTailored resumes & PDFs → resume/tailored/");
    console.log("JD analyses           → jobs/analyzed/");
    console.log("Status + checkpoints  → jobs/status.json");
    console.log("=".repeat(60));
  } finally {
    console.log("\nBrowser left open. Close it manually when finished.");
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});