import fs from "fs";

const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSDDc73CMbjTgoC-V5oxs3z96bqlBvZoe0yzh0hWB8PQVxxR8aiMSeMTxmbY1XHSYtkyPC63rav46S0/pub?gid=0&single=true&output=csv";

async function fetchJobs() {
  console.log("Downloading latest jobs from Google Sheet...");

  const response = await fetch(CSV_URL);
  if (!response.ok) {
    throw new Error(`Failed to download CSV: ${response.status}`);
  }

  const text = await response.text();
  const lines = text.trim().split("\n");

  // Parse header
  const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim());
  
  const urlIndex = headers.findIndex(h => h.toLowerCase().includes("job posting url") || h.toLowerCase().includes("url"));
  const titleIndex = headers.findIndex(h => h.toLowerCase().includes("job title") || h.toLowerCase().includes("title"));
  const companyIndex = headers.findIndex(h => h.toLowerCase().includes("company"));
  const locationIndex = headers.findIndex(h => h.toLowerCase().includes("location"));
  const scoreIndex = headers.findIndex(h => h.toLowerCase().includes("match score") || h.toLowerCase().includes("score"));
  const skillsIndex = headers.findIndex(h => h.toLowerCase().includes("key matching skills") || h.toLowerCase().includes("skills"));

  if (urlIndex === -1) {
    throw new Error("Could not find 'Job Posting URL' column in the sheet");
  }

  const jobs = [];

  for (let i = 1; i < lines.length; i++) {
    // Simple CSV split (handles most cases)
    const cols = lines[i].match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || lines[i].split(",");
    const clean = cols.map(c => c.replace(/^"|"$/g, "").trim());

    const url = clean[urlIndex];
    if (!url || !url.startsWith("http")) continue;

    const title = titleIndex >= 0 ? clean[titleIndex] : "Untitled";
    const company = companyIndex >= 0 ? clean[companyIndex] : "";
    const location = locationIndex >= 0 ? clean[locationIndex] : "";
    const score = scoreIndex >= 0 ? clean[scoreIndex] : "";
    const skills = skillsIndex >= 0 ? clean[skillsIndex] : "";

    jobs.push({
      id: `job-${String(jobs.length + 1).padStart(3, "0")}`,
      url: url,
      title: title || "Untitled",
      notes: [company, location, score ? `Match: ${score}` : "", skills].filter(Boolean).join(" | ")
    });
  }

  fs.writeFileSync("jobs.json", JSON.stringify(jobs, null, 2), "utf-8");
  console.log(`✅ Successfully fetched and saved ${jobs.length} jobs into jobs.json`);
  console.log("First 3 jobs:");
  console.log(JSON.stringify(jobs.slice(0, 3), null, 2));
}

fetchJobs().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});