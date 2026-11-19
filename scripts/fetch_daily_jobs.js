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

// Targeted search queries for Top Product Companies
const SEARCH_QUERIES = [
  'Google OR Microsoft OR Amazon OR Adobe OR Apple OR Uber OR NVIDIA OR Salesforce OR Atlassian',
  'ServiceNow OR Cisco OR Oracle OR Qualcomm OR ARM OR Flipkart OR PhonePe OR Razorpay OR Freshworks',
  'CRED OR Swiggy OR Zomato OR Zepto OR Dream11 OR Groww OR Navi OR Paytm OR BrowserStack OR Postman',
  'Chargebee OR Zoho OR InMobi OR Myntra OR Delhivery OR Policybazaar OR Darwinbox OR Acko OR Cashfree',
  'Walmart OR Target OR JPMorgan OR Goldman Sachs OR Morgan Stanley OR Wells Fargo OR Deutsche Bank',
  'Samsung OR Druva OR Databricks OR PayPal OR Stripe OR Intuit OR LinkedIn OR Airbnb OR Rubrik OR Nutanix',
  '(software OR developer OR engineer) (Google OR Microsoft OR Amazon OR Flipkart OR PhonePe OR Razorpay OR Swiggy OR Zomato OR Zepto OR Paytm OR Groww OR CRED OR Uber OR Atlassian)'
];

// Targeted queries for Tech Internships (Frontend, Backend, SDE, Software Engineer)
const INTERNSHIP_QUERIES = [
  '"frontend intern" OR "frontend internship" OR "front end intern" OR "react intern"',
  '"backend intern" OR "backend internship" OR "back end intern" OR "node intern"',
  '"sde intern" OR "sde internship" OR "software development intern"',
  '"software engineer intern" OR "software engineering intern"',
  '"full stack intern" OR "full stack developer intern" OR "web development intern"',
  '(intern OR internship) (Google OR Microsoft OR Amazon OR Adobe OR Salesforce OR Uber OR NVIDIA OR ServiceNow OR Cisco OR Oracle OR Qualcomm OR Flipkart OR PhonePe OR Razorpay OR Swiggy OR Zomato OR Zepto OR Zoho OR Samsung OR Walmart OR Goldman Sachs OR Morgan Stanley OR PayPal OR Intuit)',
  '(intern OR internship) (Atlassian OR CRED OR Groww OR Paytm OR BrowserStack OR Postman OR Chargebee OR InMobi OR Rubrik OR Databricks OR Stripe OR Apple OR LinkedIn OR Airbnb)'
];

const STRICT_DEV_REGEX = /(software|developer|engineer|sde|full[\s-]?stack|frontend|front[\s-]?end|backend|back[\s-]?end|web|react|node|python|java|javascript|typescript|golang|cloud|ai|ml|data|intern|trainee)/i;
const EXCLUDE_REGEX = /(sap abap|salesforce admin|tax|director|civil|mechanical|technician|hr|recruiter|sales|finance|accountant|telecaller|bpo|hardware lab|synthesis|power engineer|audit|vendor consultant|process lead|marketing|business development|bda|content|graphic design|operations)/i;

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
  if (/Senior|Sr\b|Lead|Principal|III|IV|Architect|Director|Manager/i.test(title)) return 'Senior Level';
  if (/Associate|Junior|Jr\b|Entry|Graduate/i.test(title)) return 'Entry / Associate (0 - 1+ Years)';
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
  if (lower.includes('week')) return num * 10080;
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
  console.log('⚡ Using Direct LinkedIn Scraper (Past 24 Hours, Sorted Newest First)...');
  const allJobs = [];

  // 1. Fetch fresh postings from Top 80 Product Companies in the past 24 hours
  for (const query of SEARCH_QUERIES) {
    const jobs = await fetchLinkedInCards(query, 'r86400', [0, 10, 20]);
    allJobs.push(...jobs);
  }

  // 2. Fetch fresh internships (Frontend, Backend, SDE, Software Engineering)
  for (const iq of INTERNSHIP_QUERIES) {
    const jobs = await fetchLinkedInCards(iq, 'r2592000', [0, 10]);
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

    const isTopProduct = TARGET_COMPANIES.some(t => 
      new RegExp(`(^|\\b|\\s)${t.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}(\\b|\\s|$)`, 'i').test(companyName)
    );

    const isInternship = /intern|internship|trainee/i.test(title);

    // Accept if it's from our 80 top product companies OR a relevant developer internship
    if (!isTopProduct && !isInternship) continue;

    if (STRICT_DEV_REGEX.test(title) && !EXCLUDE_REGEX.test(title)) {
      seenUrls.add(cleanLink);
      seenSignatures.add(sig);
      matchedJobs.push({
        ...job,
        title,
        companyName,
        link: cleanLink,
        isTopProduct,
        isInternship
      });
    }
  }

  // Sort: Top Product Internships & Roles first, newest posted first
  matchedJobs.sort((a, b) => {
    if (a.isTopProduct && !b.isTopProduct) return -1;
    if (!a.isTopProduct && b.isTopProduct) return 1;
    return (a.minutesAgo ?? 999999) - (b.minutesAgo ?? 999999);
  });

  return matchedJobs;
}

async function runJobHunter() {
  console.log('🚀 Starting Job Hunter Daily Automated Run...');
  console.log('🎯 Targeting: Top 80 Product Companies + Tech Internships (Latest Today)');

  const rawJobs = await scrapeViaDirectLinkedIn();
  console.log(`\n⏳ Processing ${rawJobs.length} gathered job listings...`);

  const matchedJobs = filterAndDeduplicate(rawJobs);
  console.log(`🎯 Quality matches found: ${matchedJobs.length}`);

  const internships = matchedJobs.filter(j => j.isInternship);
  const developerRoles = matchedJobs.filter(j => !j.isInternship);

  console.log(`   - Internships: ${internships.length}`);
  console.log(`   - 1+ YOE / Experienced Roles: ${developerRoles.length}`);

  // Guarantee minimum 5 internships if available, then developer roles
  const targetInternCount = Math.min(8, internships.length);
  const selectedInternships = internships.slice(0, targetInternCount);
  const remainingSlots = 30 - selectedInternships.length;
  const otherInternships = internships.slice(targetInternCount);
  const selectedJobs = [
    ...selectedInternships,
    ...developerRoles.slice(0, remainingSlots)
  ];
  if (selectedJobs.length < 30 && otherInternships.length > 0) {
    selectedJobs.push(...otherInternships.slice(0, 30 - selectedJobs.length));
  }

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
          🚀 Daily Top Product Companies & Internships Digest (${dateStr})
        </h2>
        <p style="color: #475569; font-size: 15px;">
          Hi Syed, here are today's fresh developer and internship openings strictly filtered from the <strong>Top 80 Product-Based Companies</strong> and tech teams in India (sorted newest first).
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
      subject: `🎯 [Top 80 Product Companies] Today's Latest Jobs & Internships (${dateStr})`,
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
