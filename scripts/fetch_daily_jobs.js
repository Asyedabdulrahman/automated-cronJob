import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RECIPIENT_EMAIL = process.env.RECIPIENT_EMAIL || 'asyedabdulrahman3@gmail.com';
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'asyedabdulrahman3@gmail.com';
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

/**
 * Target 80 Product-Based Companies in India + Leading Tech Employers
 */
const TARGET_80_COMPANIES = [
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

// Targeted search queries focused strictly on Frontend, Backend, SDE, and Software Engineer internships
const INTERNSHIP_QUERIES = [
  '"frontend intern" OR "frontend internship" OR "front end intern" OR "react intern"',
  '"backend intern" OR "backend internship" OR "back end intern" OR "node intern"',
  '"sde intern" OR "sde internship" OR "software development intern"',
  '"software engineer intern" OR "software engineering intern"',
  '"full stack intern" OR "full stack developer intern" OR "web development intern"',
  '(intern OR internship) (Google OR Microsoft OR Amazon OR Adobe OR Salesforce OR Uber OR NVIDIA OR ServiceNow OR Cisco OR Oracle OR Qualcomm OR Flipkart OR PhonePe OR Razorpay OR Swiggy OR Zomato OR Zepto OR Zoho OR Samsung OR Walmart OR Goldman Sachs OR Morgan Stanley OR PayPal OR Intuit)',
  '(intern OR internship) (Atlassian OR CRED OR Groww OR Paytm OR BrowserStack OR Postman OR Chargebee OR InMobi OR Rubrik OR Databricks OR Stripe OR Apple OR LinkedIn OR Airbnb)'
];

const DEV_INTERN_REGEX = /(frontend|front[\s-]?end|backend|back[\s-]?end|full[\s-]?stack|software|developer|engineer|sde|web|react|node|python|java|javascript|typescript|golang|cloud|ai|ml|data)/i;
const STRICT_INTERN_REGEX = /(intern|internship|trainee)/i;
const EXCLUDE_REGEX = /(sap abap|salesforce admin|tax|director|civil|mechanical|technician|hr|recruiter|sales|finance|accountant|telecaller|bpo|hardware lab|synthesis|power engineer|marketing|business development|bda|content|graphic design|operations)/i;

function decodeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
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
  if (lower.includes('week')) return num * 10080;
  return 999999;
}

async function fetchLinkedInInternships(query, start = 0) {
  const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(query)}&location=India&f_TPR=r2592000&sortBy=DD&start=${start}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    if (!res.ok) return [];
    const html = await res.text();
    const cards = html.split('<li>').slice(1);
    const jobs = [];
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
    return jobs;
  } catch (e) {
    return [];
  }
}

async function runJobHunter() {
  console.log('🚀 Starting Exclusively Tech Internships Hunter...');
  console.log('🎯 Categories: Frontend, Backend, Software Engineer, SDE Internships');

  const rawJobs = [];
  for (const q of INTERNSHIP_QUERIES) {
    for (const start of [0, 10, 20]) {
      const jobs = await fetchLinkedInInternships(q, start);
      rawJobs.push(...jobs);
      await new Promise(r => setTimeout(r, 250));
    }
  }

  console.log(`\n⏳ Processing ${rawJobs.length} gathered internship listings...`);

  const seenUrls = new Set();
  const seenSignatures = new Set();
  const matchedInternships = [];

  for (const job of rawJobs) {
    if (!job.title || !job.companyName || !job.link) continue;
    const cleanLink = job.link.split('?')[0];
    if (seenUrls.has(cleanLink)) continue;

    const title = job.title.trim();
    const company = job.companyName.trim();
    const sig = `${company.toLowerCase()}|${title.toLowerCase()}`;
    if (seenSignatures.has(sig)) continue;

    // Must be strictly an internship and tech role
    if (STRICT_INTERN_REGEX.test(title) && DEV_INTERN_REGEX.test(title) && !EXCLUDE_REGEX.test(title)) {
      seenUrls.add(cleanLink);
      seenSignatures.add(sig);

      const isTopProduct = TARGET_80_COMPANIES.some(t => 
        new RegExp(`(^|\\b|\\s)${t.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}(\\b|\\s|$)`, 'i').test(company)
      );

      matchedInternships.push({
        ...job,
        title,
        companyName: company,
        link: cleanLink,
        isTopProduct
      });
    }
  }

  // Priority sort: Top Product-based companies first, then newest posted first
  matchedInternships.sort((a, b) => {
    if (a.isTopProduct && !b.isTopProduct) return -1;
    if (!a.isTopProduct && b.isTopProduct) return 1;
    return (a.minutesAgo ?? 999999) - (b.minutesAgo ?? 999999);
  });

  const selectedJobs = matchedInternships.slice(0, 30);
  console.log(`🎯 Total Curated Tech Internships: ${selectedJobs.length}`);

  const downloadsDir = path.join(os.homedir(), 'Downloads');
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }

  const dateStr = new Date().toISOString().split('T')[0];
  const outputFileName = `Daily_Tech_Internships_${dateStr}.csv`;
  const outputPath = path.join(downloadsDir, outputFileName);

  const csvRows = [
    ['S.No', 'Job Title', 'Company Name', 'Location', 'Experience', 'Posted', 'LinkedIn Apply Link'].map(escapeCsv).join(',')
  ];

  selectedJobs.forEach((job, index) => {
    const posted = job.postedAgo ? `${job.postedAgo} (${job.postedDate || dateStr})` : (job.postedDate || 'Recent');
    csvRows.push([
      index + 1,
      job.title || '',
      job.companyName || '',
      job.location || 'India',
      'Internship',
      posted,
      job.link || ''
    ].map(escapeCsv).join(','));
  });

  fs.writeFileSync(outputPath, '\uFEFF' + csvRows.join('\n'), 'utf8');
  console.log(`📁 Saved CSV locally: ${outputPath}`);

  if (GMAIL_APP_PASSWORD) {
    console.log(`\n📧 Sending daily internship digest to: ${RECIPIENT_EMAIL}...`);
    await sendJobDigestEmail({
      recipient: RECIPIENT_EMAIL,
      dateStr,
      jobs: selectedJobs,
      csvPath: outputPath,
      csvFileName: outputFileName
    });
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
      const cleanLink = job.link.split('?')[0];

      return `Company : ${job.companyName}
Role : ${job.title}
Location : ${job.location || 'India'}
Experience : Internship
Link : ${cleanLink}`;
    }).join('\n\n');

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: auto; padding: 20px; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0;">
        <h2 style="color: #0f172a; border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-top: 0;">
          🎓 Daily Tech Internships Digest (${dateStr})
        </h2>
        <p style="color: #475569; font-size: 15px;">
          Hi Syed, here are today's curated <strong>Frontend, Backend, SDE, and Software Engineer Internships</strong> across top product companies and fast-growing tech teams in India.
        </p>

        <!-- WHATSAPP READY COPY BLOCK -->
        <div style="background-color: #f1f5f9; border-left: 4px solid #22c55e; padding: 16px; border-radius: 6px; margin: 20px 0;">
          <h3 style="color: #0f172a; margin-top: 0; margin-bottom: 8px; font-size: 16px;">
            📱 WhatsApp Ready Format (Tap & Copy below to paste in group):
          </h3>
          <pre style="white-space: pre-wrap; font-family: monospace; font-size: 13px; color: #1e293b; background: #ffffff; padding: 15px; border-radius: 6px; border: 1px solid #cbd5e1; user-select: all; line-height: 1.5;">${whatsappTextBlocks}</pre>
        </div>

        <p style="color: #1e293b; font-size: 14px; margin-top: 20px; background-color: #eff6ff; padding: 12px; border-radius: 6px; border: 1px solid #bfdbfe;">
          📎 <strong>CSV Spreadsheet Attached:</strong> <code>${csvFileName}</code> is attached to this email containing all curated internships.
        </p>
      </div>
    `;

    await transporter.sendMail({
      from: `"Job Hunter Bot" <${SENDER_EMAIL}>`,
      to: recipient,
      subject: `🎯 [Tech Internships] Frontend, Backend, SDE & Software Engineer (${dateStr})`,
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
