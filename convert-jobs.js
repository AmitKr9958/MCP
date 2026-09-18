import XLSX from "xlsx";
import fs from "fs";

const workbook = XLSX.readFile("JOB POSTING.xlsx");
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet);

const jobs = rows
  .filter(row => row["Job Posting URL"] && String(row["Job Posting URL"]).startsWith("http"))
  .map((row, index) => ({
    id: `job-${String(index + 1).padStart(3, "0")}`,
    url: String(row["Job Posting URL"]).trim(),
    title: row["Job Title"] || "Untitled",
    notes: [
      row["Company Name"] || "",
      row["Location"] || "",
      row["Match Score"] ? `Match: ${row["Match Score"]}` : "",
      row["Key Matching Skills"] || ""
    ].filter(Boolean).join(" | ")
  }));

fs.writeFileSync("jobs.json", JSON.stringify(jobs, null, 2), "utf-8");

console.log(`✅ Successfully converted ${jobs.length} jobs into jobs.json`);
console.log(`First 3 jobs:`);
console.log(JSON.stringify(jobs.slice(0, 3), null, 2));