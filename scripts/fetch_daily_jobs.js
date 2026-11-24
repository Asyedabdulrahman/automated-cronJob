import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read from Environment Variables (Secure)
const APIFY_TOKEN = process.env.APIFY_TOKEN;
const ACTOR_ID = 'curious_coder~linkedin-jobs-scraper';

const RECIPIENT_EMAIL = process.env.RECIPIENT_EMAIL || 'asyedabdulrahman3@gmail.com';
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'asyedabdulrahman3@gmail.com';
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

/**
 * 80 Top Product-Based Companies strictly targeted
 */
const TARGET_COMPANIES = [
  "Google", "Microsoft", "Amazon", "Adobe", "Atlassian", "Salesforce", "Uber", "Apple", "NVIDIA", "ServiceNow",
  "Cisco", "Oracle", "SAP Labs", "Qualcomm", "ARM", "Flipkart", "PhonePe", "Razorpay", "Freshworks", "CRED",
  "Swiggy", "Zomato", "Zepto", "Dream11", "Groww", "Navi", "Paytm", "BrowserStack", "Postman", "Chargebee",
  "Zoho", "InMobi", "Myntra", "Delhivery", "Policybazaar", "Sarvam AI", "Krutrim", "Moglix", "Darwinbox", "Khatabook",
  "Acko", "Cashfree Payments", "Cashfree", "Exotel", "Plivo", "CleverTap", "Capillary Technologies", "Capillary", "Nium", "Fi Money",
  "Fibe", "Ather Energy", "Ather", "Rapido", "Shadowfax", "Ninjacart", "BlackBuck", "Practo", "Rupeek", "CARS24",
  "Rebel Foods", "Physics Wallah", "Scaler", "Walmart Global Tech", "Walmart", "Target", "JPMorgan Chase", "JPMorgan", "J.P. Morgan", "Goldman Sachs",
  "Morgan Stanley", "Wells Fargo", "Deutsche Bank", "Samsung R&D", "Samsung", "Druva", "Databricks", "PayPal", "Stripe", "Intuit",
  "LinkedIn", "Airbnb", "Rubrik", "Confluent", "Twilio", "Nutanix", "VMware", "Broadcom"
];

// Targeted search queries strictly for Software Engineer, SDE, and SDE Internship
const SEARCH_QUERIES = [
  '"Software Engineer" OR "Software Development Engineer" OR "SDE" (Google OR Microsoft OR Amazon OR Adobe OR Apple OR Uber OR NVIDIA OR Salesforce OR Atlassian)',
  '"Software Engineer" OR "Software Development Engineer" OR "SDE" (ServiceNow OR Cisco OR Oracle OR Qualcomm OR ARM OR Flipkart OR PhonePe OR Razorpay OR Freshworks)',
  '"Software Engineer" OR "Software Development Engineer" OR "SDE" (CRED OR Swiggy OR Zomato OR Zepto OR Dream11 OR Groww OR Navi OR Paytm OR BrowserStack OR Postman)',
  '"Software Engineer" OR "Software Development Engineer" OR "SDE" (Walmart OR Target OR JPMorgan OR Goldman Sachs OR Morgan Stanley OR Wells Fargo OR Deutsche Bank)',
  '"Software Engineer" OR "Software Development Engineer" OR "SDE" (Samsung OR Druva OR Databricks OR PayPal OR Stripe OR Intuit OR LinkedIn OR Airbnb OR Rubrik OR Nutanix)',
  '("SDE Intern" OR "SDE Internship" OR "Software Engineer Intern" OR "Software Development Engineer Intern") India'
];

// Strictly Software Engineer, SDE, and SDE Internship
const SDE_ONLY_REGEX = /\b(software\s*engineer|software\s*development\s*engineer|sde|software\s*developer)\b/i;
const EXCLUDE_NON_SDE = /(support|financial\s*analyst|sales|recruiter|hr|hardware\s*lab|mechanical|civil|marketing|accountant|consultant|technician)/i;

function decodeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function getExperience(job) {
  const title = job.title || '';
  if (/intern|trainee|fresher/i.test(title)) return 'Internship';
  if (/Senior|Sr\b|Lead|Principal|III|IV|Staff|Architect|Director|Manager/i.test(title)) return 'Senior Level';
  if (/Associate|Junior|Jr\b|Entry|Graduate|I\b/i.test(title)) return 'Entry / Associate (0 - 1+ Years)';
  return '1+ Years / Mid Level';
}

function parseMinutesAgo(postedAgo) {
  if (!postedAgo) return 999999;
  const lower = postedAgo.toLowerCase();
  const numMatch = lower.match(/(\d+)/);
  const num = numMatch ? parseInt(numMatch[1], 10) : 1;
  if (lower.includes('just now') || lower.includes('second')) return 0;
  if (lower.includes('minute')) return num;
  if (lower.includes('hour')) return num * 60;
  if (lower.includes('day')) return num * 1440;
  return 999999;
}

async function fetchLinkedInCards(query, timeFilter = 'r86400', pages = [0, 10, 20]) {
  const jobs = [];
  for (const start of pages) {
    const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(query)}&location=India&f_TPR=${timeFilter}&sortBy=DD&start=${start}`;
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      if (!res.ok) continue;
      const html = await res.text();
      const cards = html.split('<li>').slice(1);
      for (const c of cards) {
        const titleRaw = (c.match(/<h3 class="base-search-card__title">([\s\S]*?)<\/h3>/) || [])[1]?.trim();
        const companyRaw = (c.match(/<h4 class="base-search-card__subtitle">([\s\S]*?)<\/h4>/) || [])[1]?.replace(/<[^>]+>/g, '').trim();
        const locRaw = (c.match(/<span class="job-search-card__location">([\s\S]*?)<\/span>/) || [])[1]?.trim();
        const link = (c.match(/<a class="base-card__full-link[^"]*" href="([^"]+)"/) || [])[1]?.split('?')[0];
        const postedAgo = (c.match(/<time[^>]*>([\s\S]*?)<\/time>/) || [])[1]?.trim() || '';
        const postedDate = (c.match(/datetime="([^"]+)"/) || [])[1] || '';

        if (titleRaw && companyRaw && link) {
          jobs.push({
            title: decodeHtml(titleRaw),
            companyName: decodeHtml(companyRaw),
            location: decodeHtml(locRaw || 'India'),
            link,
            postedAgo,
            postedDate,
            minutesAgo: parseMinutesAgo(postedAgo)
          });
        }
      }
      await new Promise(r => setTimeout(r, 250));
    } catch (e) {
      // continue
    }
  }
  return jobs;
}

async function scrapeViaDirectLinkedIn() {
  console.log('⚡ Scraping LinkedIn for today\'s Software Engineer, SDE, and SDE Internship postings (Past 24h, Newest First)...');
  const allJobs = [];

  for (const query of SEARCH_QUERIES) {
    const jobs = await fetchLinkedInCards(query, 'r86400', [0, 10, 20]);
    allJobs.push(...jobs);
  }

  return allJobs;
}

function filterAndDeduplicate(rawJobs) {
  const seenUrls = new Set();
  const seenSignatures = new Set();
  const matchedJobs = [];

  for (const job of rawJobs) {
    if (!job.title || !job.companyName || !job.link) continue;
    const cleanLink = job.link.split('?')[0];
    if (seenUrls.has(cleanLink)) continue;

    const companyName = job.companyName.trim();
    const title = job.title.trim();
    const sig = `${companyName.toLowerCase()}|${title.toLowerCase()}`;
    if (seenSignatures.has(sig)) continue;

    // Strictly Software Engineer, SDE, SDE Internship
    if (!SDE_ONLY_REGEX.test(title)) continue;
    if (EXCLUDE_NON_SDE.test(title)) continue;

    // Must be listed today (within 24 hours / 1440 minutes)
    if (job.minutesAgo > 1440) continue;

    const isTopProduct = TARGET_COMPANIES.some(t => 
      new RegExp(`(^|\\b|\\s)${t.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}(\\b|\\s|$)`, 'i').test(companyName)
    );

    const isSdeIntern = /intern|internship|trainee/i.test(title);

    // Filter to top 80 product companies or verified tech internships
    if (!isTopProduct && !isSdeIntern) continue;

    seenUrls.add(cleanLink);
    seenSignatures.add(sig);
    matchedJobs.push({
      ...job,
      title,
      companyName,
      link: cleanLink,
      isTopProduct,
      isSdeIntern
    });
  }

  // Sort strictly by newest posted first (posted today)
  matchedJobs.sort((a, b) => (a.minutesAgo ?? 999999) - (b.minutesAgo ?? 999999));

  return matchedJobs;
}

async function runJobHunter() {
  console.log('🚀 Starting Job Hunter Daily Automated Run...');
  console.log('🎯 Scope: Strictly Today\'s Listed Jobs -> Software Engineer, SDE, and SDE Internships');

  const rawJobs = await scrapeViaDirectLinkedIn();
  console.log(`\n⏳ Processing ${rawJobs.length} gathered job listings...`);

  const matchedJobs = filterAndDeduplicate(rawJobs);
  console.log(`🎯 Quality matches found: ${matchedJobs.length}`);

  const internships = matchedJobs.filter(j => j.isSdeIntern);
  const developerRoles = matchedJobs.filter(j => !j.isSdeIntern);

  console.log(`   - SDE Internships: ${internships.length}`);
  console.log(`   - Software Engineer / SDE Roles: ${developerRoles.length}`);

  const selectedJobs = [...internships, ...developerRoles].slice(0, 30);

  const downloadsDir = path.join(os.homedir(), 'Downloads');
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }

  const dateStr = new Date().toISOString().split('T')[0];
  const outputFileName = `Daily_Top_Product_Jobs_${dateStr}.csv`;
  const outputPath = path.join(downloadsDir, outputFileName);

  const csvRows = [
    ['S.No', 'Job Title', 'Company Name', 'Location', 'Experience', 'Posted', 'LinkedIn Apply Link'].map(escapeCsv).join(',')
  ];

  selectedJobs.forEach((job, index) => {
    const exp = getExperience(job);
    const posted = job.postedAgo ? `${job.postedAgo} (${job.postedDate || dateStr})` : (job.postedDate || 'Today');
    csvRows.push([
      index + 1,
      job.title || '',
      job.companyName || '',
      job.location || 'India',
      exp,
      posted,
      job.link || ''
    ].map(escapeCsv).join(','));
  });

  fs.writeFileSync(outputPath, '\uFEFF' + csvRows.join('\n'), 'utf8');
  console.log(`📁 Saved CSV locally: ${outputPath}`);

  if (GMAIL_APP_PASSWORD) {
    console.log(`\n📧 Sending daily digest to: ${RECIPIENT_EMAIL}...`);
    await sendJobDigestEmail({
      recipient: RECIPIENT_EMAIL,
      dateStr,
      jobs: selectedJobs,
      csvPath: outputPath,
      csvFileName: outputFileName
    });
  } else {
    console.log(`\nℹ️ Email not sent: GMAIL_APP_PASSWORD environment variable is not set.`);
  }

  return selectedJobs;
}

async function sendJobDigestEmail({ recipient, dateStr, jobs, csvPath, csvFileName }) {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: SENDER_EMAIL,
        pass: GMAIL_APP_PASSWORD
      }
    });

    const whatsappTextBlocks = jobs.map(job => {
      const exp = getExperience(job);
      const cleanLink = job.link.split('?')[0];

      return `Company : ${job.companyName}
Role : ${job.title}
Location : ${job.location || 'India'}
Experience : ${exp}
Link : ${cleanLink}`;
    }).join('\n\n');

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: auto; padding: 20px; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0;">
        <h2 style="color: #0f172a; border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-top: 0;">
          🚀 Today's Listed Jobs: Software Engineer, SDE & SDE Internships (${dateStr})
        </h2>
        <p style="color: #475569; font-size: 15px;">
          Hi Syed, here are today's strictly curated <strong>Software Engineer, SDE, and SDE Internship</strong> openings from the Top Product-Based Companies in India (posted today / last 24 hours, sorted newest first).
        </p>

        <!-- WHATSAPP READY COPY BLOCK -->
        <div style="background-color: #f1f5f9; border-left: 4px solid #22c55e; padding: 16px; border-radius: 6px; margin: 20px 0;">
          <h3 style="color: #0f172a; margin-top: 0; margin-bottom: 8px; font-size: 16px;">
            📱 WhatsApp Ready Format (Tap & Copy below to paste in group):
          </h3>
          <pre style="white-space: pre-wrap; font-family: monospace; font-size: 13px; color: #1e293b; background: #ffffff; padding: 15px; border-radius: 6px; border: 1px solid #cbd5e1; user-select: all; line-height: 1.5;">${whatsappTextBlocks}</pre>
        </div>

        <p style="color: #1e293b; font-size: 14px; margin-top: 20px; background-color: #eff6ff; padding: 12px; border-radius: 6px; border: 1px solid #bfdbfe;">
          📎 <strong>CSV Spreadsheet Attached:</strong> <code>${csvFileName}</code> is attached to this email containing all curated jobs.
        </p>
      </div>
    `;

    await transporter.sendMail({
      from: `"Job Hunter Bot" <${SENDER_EMAIL}>`,
      to: recipient,
      subject: `🎯 [Today's SDE & Software Engineer Jobs] ${dateStr}`,
      text: whatsappTextBlocks,
      html: htmlContent,
      attachments: [
        {
          filename: csvFileName,
          path: csvPath
        }
      ]
    });

    console.log(`✅ Email successfully delivered to ${recipient}!`);
  } catch (err) {
    console.error('❌ Failed to send email:', err.message);
  }
}

function escapeCsv(field) {
  if (field === null || field === undefined) return '""';
  const str = String(field).replace(/"/g, '""');
  return `"${str}"`;
}

runJobHunter().catch(console.error);
