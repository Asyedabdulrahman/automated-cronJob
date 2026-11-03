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

if (!APIFY_TOKEN) {
  console.error('❌ Error: APIFY_TOKEN environment variable is required.');
  process.exit(1);
}

const STRICT_KEYWORDS_REGEX = /(full[\s-]?stack|frontend|front[\s-]?end|backend|back[\s-]?end|software (developer|engineer)|sde|react|next\.?js|node\.?js|mern|pern|product engineer|web developer|api engineer)/i;
const EXCLUDE_REGEX = /(sap|salesforce|data scientist|analyst|hardware|firmware|embedded|fpga|dsp|civil|mechanical|technician|hr|marketing|recruiter|sales|finance|accountant|telecaller|bpo|support|lead physical|synthesis|power engineer)/i;

const SEARCH_URLS = [
  'https://www.linkedin.com/jobs/search?keywords=Full%20Stack%20Developer&location=India&f_TPR=r86400&position=1&pageNum=0',
  'https://www.linkedin.com/jobs/search?keywords=Software%20Development%20Engineer&location=India&f_TPR=r86400&position=1&pageNum=0',
  'https://www.linkedin.com/jobs/search?keywords=Frontend%20Developer&location=India&f_TPR=r86400&position=1&pageNum=0',
  'https://www.linkedin.com/jobs/search?keywords=Backend%20Developer&location=India&f_TPR=r86400&position=1&pageNum=0',
  'https://www.linkedin.com/jobs/search?keywords=React%20Developer%20OR%20Node.js%20Developer&location=India&f_TPR=r86400&position=1&pageNum=0'
];

async function runJobHunter() {
  console.log('🚀 Starting Job Hunter Daily Automated Run...');
  console.log('🎯 Target: Software Developer, Full Stack, Frontend, Backend, React, Node, SDE');

  console.log('\n⏳ Step 1: Starting Apify cloud run...');
  const runResponse = await fetch(`https://api.apify.com/v2/acts/${ACTOR_ID}/runs`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${APIFY_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      urls: SEARCH_URLS,
      scrapeCompany: false,
      count: 100
    })
  });

  const runData = await runResponse.json();
  const runId = runData.data?.id;
  const datasetId = runData.data?.defaultDatasetId;

  if (!runId) {
    console.error('❌ Failed to start run:', runData);
    return;
  }

  console.log(`✅ Run started: ${runId}`);

  console.log('⏳ Step 2: Waiting for job listings to be gathered...');
  let status = 'RUNNING';
  while (status === 'RUNNING' || status === 'READY') {
    await new Promise(r => setTimeout(r, 4000));
    const checkRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, {
      headers: { 'Authorization': `Bearer ${APIFY_TOKEN}` }
    });
    const checkData = await checkRes.json();
    status = checkData.data?.status;
    process.stdout.write(`...status: ${status}\n`);
  }

  if (status !== 'SUCCEEDED') {
    console.error(`❌ Scrape ended with status: ${status}`);
    return;
  }

  console.log('⏳ Step 3: Fetching and parsing items...');
  const datasetRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items`, {
    headers: { 'Authorization': `Bearer ${APIFY_TOKEN}` }
  });
  const items = await datasetRes.json();

  const seenUrls = new Set();
  const matchedJobs = [];

  for (const job of items) {
    if (!job.title || !job.companyName || !job.link) continue;
    if (seenUrls.has(job.link)) continue;

    const title = job.title.trim();
    if (STRICT_KEYWORDS_REGEX.test(title) && !EXCLUDE_REGEX.test(title)) {
      seenUrls.add(job.link);
      matchedJobs.push(job);
    }
  }

  console.log(`🎯 Quality matches found: ${matchedJobs.length}`);
  const topJobs = matchedJobs.slice(0, 25);

  const downloadsDir = path.join(os.homedir(), 'Downloads');
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }

  const dateStr = new Date().toISOString().split('T')[0];
  const outputFileName = `Daily_Software_Jobs_${dateStr}.csv`;
  const outputPath = path.join(downloadsDir, outputFileName);

  const csvRows = [
    ['S.No', 'Job Title', 'Company Name', 'Location', 'Date Posted', 'LinkedIn Apply Link'].map(escapeCsv).join(',')
  ];

  topJobs.forEach((job, index) => {
    csvRows.push([
      index + 1,
      job.title || '',
      job.companyName || '',
      job.location || '',
      job.postedAt || dateStr,
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
      jobs: topJobs,
      csvPath: outputPath,
      csvFileName: outputFileName
    });
  } else {
    console.log(`\nℹ️ Email not sent: GMAIL_APP_PASSWORD environment variable is not set.`);
  }
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

    // Build WhatsApp Plain-Text Copy Block
    const whatsappTextBlocks = jobs.map(job => {
      let exp = 'Mid-Senior Level';
      if (/Senior|Sr|Lead|Principal|III|IV/i.test(job.title)) exp = 'Senior Level';
      else if (/Associate|Junior|Jr|Entry|Intern/i.test(job.title)) exp = 'Entry / Associate Level';

      const cleanLink = job.link.split('?')[0];

      return `Company : ${job.companyName}
Role : ${job.title}
Location : ${job.location || 'India'}
Experience : ${exp}
Link : ${cleanLink}`;
    }).join('\n\n');

    // Build Table for rich visual reading in email
    const jobTableRows = jobs.slice(0, 15).map((job, idx) => `
      <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 0 ? 'background-color: #f8fafc;' : ''}">
        <td style="padding: 10px; font-weight: bold; color: #1e293b;">${idx + 1}</td>
        <td style="padding: 10px; color: #0f172a; font-weight: 600;">${job.title}</td>
        <td style="padding: 10px; color: #334155;">${job.companyName}</td>
        <td style="padding: 10px; color: #64748b;">${job.location}</td>
        <td style="padding: 10px;">
          <a href="${job.link}" style="background-color: #2563eb; color: #ffffff; padding: 6px 12px; text-decoration: none; border-radius: 4px; font-size: 13px; font-weight: bold; display: inline-block;">Apply Now</a>
        </td>
      </tr>
    `).join('');

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: auto; padding: 20px; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0;">
        <h2 style="color: #0f172a; border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-top: 0;">
          🚀 Daily Fresh Software Engineer & Full-Stack Jobs (${dateStr})
        </h2>
        <p style="color: #475569; font-size: 15px;">
          Hi Syed, here are today's top fresh engineering openings scraped from LinkedIn.
        </p>

        <!-- WHATSAPP READY COPY BLOCK -->
        <div style="background-color: #f1f5f9; border-left: 4px solid #22c55e; padding: 16px; border-radius: 6px; margin: 20px 0;">
          <h3 style="color: #0f172a; margin-top: 0; margin-bottom: 8px; font-size: 16px;">
            📱 WhatsApp Ready Format (Tap & Copy below to paste in group):
          </h3>
          <pre style="white-space: pre-wrap; font-family: monospace; font-size: 13px; color: #1e293b; background: #ffffff; padding: 15px; border-radius: 6px; border: 1px solid #cbd5e1; user-select: all; line-height: 1.5;">${whatsappTextBlocks}</pre>
        </div>

        <!-- VISUAL TABLE -->
        <h3 style="color: #0f172a; margin-top: 25px; margin-bottom: 10px; font-size: 16px;">
          📊 Quick Overview Table:
        </h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px; text-align: left;">
          <thead>
            <tr style="background-color: #1e293b; color: #ffffff;">
              <th style="padding: 10px;">#</th>
              <th style="padding: 10px;">Role</th>
              <th style="padding: 10px;">Company</th>
              <th style="padding: 10px;">Location</th>
              <th style="padding: 10px;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${jobTableRows}
          </tbody>
        </table>

        <p style="color: #64748b; font-size: 13px; margin-top: 20px;">
          📎 <strong>The full spreadsheet is attached (${csvFileName})</strong> containing all ${jobs.length} curated jobs.
        </p>
      </div>
    `;

    await transporter.sendMail({
      from: `"Job Hunter Bot" <${SENDER_EMAIL}>`,
      to: recipient,
      subject: `🎯 [Daily Jobs ${dateStr}] Top 20+ Software & Full-Stack Openings`,
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
