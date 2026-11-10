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

const SEARCH_QUERIES = [
  'Google OR Microsoft OR Amazon OR Adobe OR Apple OR Uber OR NVIDIA OR Salesforce OR Atlassian',
  'ServiceNow OR Cisco OR Oracle OR Qualcomm OR ARM OR Flipkart OR PhonePe OR Razorpay OR Freshworks',
  'CRED OR Swiggy OR Zomato OR Zepto OR Dream11 OR Groww OR Navi OR Paytm OR BrowserStack OR Postman',
  'Chargebee OR Zoho OR InMobi OR Myntra OR Delhivery OR Policybazaar OR Darwinbox OR Acko OR Cashfree',
  'Walmart OR Target OR JPMorgan OR Goldman Sachs OR Morgan Stanley OR Wells Fargo OR Deutsche Bank',
  'Samsung OR Druva OR Databricks OR PayPal OR Stripe OR Intuit OR LinkedIn OR Airbnb OR Rubrik OR Nutanix',
  '(intern OR internship) (Google OR Microsoft OR Amazon OR Adobe OR Salesforce OR Uber OR NVIDIA OR ServiceNow OR Cisco OR Oracle OR Qualcomm OR Flipkart OR PhonePe OR Razorpay OR Swiggy OR Zomato OR Zepto OR Zoho OR Samsung OR Walmart OR Goldman Sachs OR Morgan Stanley OR PayPal OR Intuit)',
  '(software intern OR developer intern OR engineering intern) India'
];

const STRICT_DEV_REGEX = /(software|developer|engineer|sde|full[\s-]?stack|frontend|front[\s-]?end|backend|back[\s-]?end|web|react|node|intern|trainee)/i;
const EXCLUDE_REGEX = /(sap abap|salesforce admin|tax|director|civil|mechanical|technician|hr|recruiter|sales|finance|accountant|telecaller|bpo|hardware lab|synthesis|power engineer)/i;

function getExperience(job) {
  const title = job.title || '';
  if (/intern|trainee|fresher/i.test(title)) return 'Internship';
  if (/Senior|Sr\b|Lead|Principal|III|IV|Architect|Director|Manager/i.test(title)) return 'Senior Level';
  if (/Associate|Junior|Jr\b|Entry|Graduate/i.test(title)) return 'Entry / Associate (0 - 1+ Years)';
  return '1+ Years / Mid Level';
}

async function scrapeViaApify() {
  if (!APIFY_TOKEN) return null;
  console.log('⏳ Attempting Apify cloud run...');
  try {
    const searchUrls = [
      'https://www.linkedin.com/jobs/search?keywords=Google%20OR%20Microsoft%20OR%20Amazon%20OR%20Adobe%20OR%20Atlassian%20OR%20Salesforce%20OR%20Uber%20OR%20Apple%20OR%20NVIDIA&location=India&f_TPR=r86400&position=1&pageNum=0',
      'https://www.linkedin.com/jobs/search?keywords=ServiceNow%20OR%20Cisco%20OR%20Oracle%20OR%20Qualcomm%20OR%20ARM%20OR%20Flipkart%20OR%20PhonePe%20OR%20Razorpay%20OR%20Freshworks&location=India&f_TPR=r86400&position=1&pageNum=0',
      'https://www.linkedin.com/jobs/search?keywords=CRED%20OR%20Swiggy%20OR%20Zomato%20OR%20Zepto%20OR%20Dream11%20OR%20Groww%20OR%20Navi%20OR%20Paytm%20OR%20BrowserStack%20OR%20Postman&location=India&f_TPR=r86400&position=1&pageNum=0',
      'https://www.linkedin.com/jobs/search?keywords=Chargebee%20OR%20Zoho%20OR%20InMobi%20OR%20Myntra%20OR%20Delhivery%20OR%20Policybazaar%20OR%20Darwinbox%20OR%20Acko%20OR%20Cashfree&location=India&f_TPR=r86400&position=1&pageNum=0',
      'https://www.linkedin.com/jobs/search?keywords=Walmart%20OR%20Target%20OR%20JPMorgan%20OR%20Goldman%20Sachs%20OR%20Morgan%20Stanley%20OR%20Wells%20Fargo%20OR%20Deutsche%20Bank&location=India&f_TPR=r86400&position=1&pageNum=0',
      'https://www.linkedin.com/jobs/search?keywords=Samsung%20OR%20Druva%20OR%20Databricks%20OR%20PayPal%20OR%20Stripe%20OR%20Intuit%20OR%20LinkedIn%20OR%20Airbnb%20OR%20Rubrik%20OR%20Nutanix&location=India&f_TPR=r86400&position=1&pageNum=0',
      'https://www.linkedin.com/jobs/search?keywords=(intern%20OR%20internship)%20AND%20(Google%20OR%20Microsoft%20OR%20Amazon%20OR%20Adobe%20OR%20Salesforce%20OR%20Uber%20OR%20NVIDIA%20OR%20ServiceNow%20OR%20Cisco%20OR%20Oracle%20OR%20Qualcomm%20OR%20Flipkart%20OR%20PhonePe%20OR%20Razorpay%20OR%20Swiggy%20OR%20Zomato%20OR%20Zepto%20OR%20Zoho%20OR%20Samsung%20OR%20Walmart%20OR%20Goldman%20Sachs%20OR%20Morgan%20Stanley%20OR%20PayPal%20OR%20Intuit)&location=India&f_TPR=r2592000&position=1&pageNum=0'
    ];
    const runResponse = await fetch(`https://api.apify.com/v2/acts/${ACTOR_ID}/runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${APIFY_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        urls: searchUrls,
        scrapeCompany: false,
        count: 180
      })
    });
    const runData = await runResponse.json();
    const runId = runData.data?.id;
    const datasetId = runData.data?.defaultDatasetId;

    if (!runId) {
      console.warn('⚠️ Apify run did not start (e.g. usage limit reached), switching to Direct Scraper.');
      return null;
    }

    let status = 'RUNNING';
    while (status === 'RUNNING' || status === 'READY') {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const checkRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, {
          headers: { 'Authorization': `Bearer ${APIFY_TOKEN}` }
        });
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          status = checkData.data?.status || status;
        }
      } catch (e) {
        // retry
      }
    }

    if (status !== 'SUCCEEDED') return null;

    const datasetRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items`, {
      headers: { 'Authorization': `Bearer ${APIFY_TOKEN}` }
    });
    return await datasetRes.json();
  } catch (err) {
    console.warn(`⚠️ Apify error: ${err.message}. Falling back to Direct Scraper.`);
    return null;
  }
}

async function scrapeViaDirectLinkedIn() {
  console.log('⚡ Using Direct LinkedIn Scraper (Fast, Free & Unlimited)...');
  const allJobs = [];

  for (const query of SEARCH_QUERIES) {
    for (const start of [0, 25]) {
      const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(query)}&location=India&f_TPR=r604800&start=${start}`;
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });
        if (!res.ok) continue;
        const html = await res.text();

        const titles = [...html.matchAll(/<h3 class="base-search-card__title">([\s\S]*?)<\/h3>/g)].map(m => m[1].trim());
        const companies = [...html.matchAll(/<h4 class="base-search-card__subtitle">([\s\S]*?)<\/h4>/g)].map(m => m[1].replace(/<[^>]+>/g, '').trim());
        const locations = [...html.matchAll(/<span class="job-search-card__location">([\s\S]*?)<\/span>/g)].map(m => m[1].trim());
        const links = [...html.matchAll(/<a class="base-card__full-link[^"]*" href="([^"]+)"/g)].map(m => m[1].split('?')[0]);

        for (let i = 0; i < titles.length; i++) {
          if (titles[i] && companies[i] && links[i]) {
            allJobs.push({
              title: titles[i],
              companyName: companies[i],
              location: locations[i] || 'India',
              link: links[i]
            });
          }
        }
        await new Promise(r => setTimeout(r, 400));
      } catch (e) {
        // continue
      }
    }
  }

  return allJobs;
}

async function runJobHunter() {
  console.log('🚀 Starting Job Hunter Daily Automated Run...');
  console.log(`🎯 Strictly filtering from: 80 Top Product-Based Companies in India`);

  let rawJobs = await scrapeViaApify();
  if (!rawJobs || rawJobs.length === 0) {
    rawJobs = await scrapeViaDirectLinkedIn();
  }

  console.log(`\n⏳ Processing ${rawJobs.length} gathered job listings...`);

  const seenUrls = new Set();
  const matchedJobs = [];

  for (const job of rawJobs) {
    if (!job.title || !job.companyName || !job.link) continue;
    if (seenUrls.has(job.link)) continue;

    const companyName = job.companyName.trim();
    const isTargetCompany = TARGET_COMPANIES.some(t => 
      new RegExp(`(^|\\b|\\s)${t.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}(\\b|\\s|$)`, 'i').test(companyName)
    );

    if (!isTargetCompany) continue;

    const title = job.title.trim();
    if (STRICT_DEV_REGEX.test(title) && !EXCLUDE_REGEX.test(title)) {
      seenUrls.add(job.link);
      matchedJobs.push(job);
    }
  }

  console.log(`🎯 Quality matches found from 80 Target Companies: ${matchedJobs.length}`);

  // Separate internships and regular / 1+ YOE roles
  const internships = matchedJobs.filter(j => /intern|trainee|fresher|graduate/i.test(j.title));
  const developerRoles = matchedJobs.filter(j => !/intern|trainee|fresher|graduate/i.test(j.title));

  console.log(`   - Internships: ${internships.length}`);
  console.log(`   - 1+ YOE / Experienced Roles: ${developerRoles.length}`);

  // Ensure minimum 5 internships prioritized if available
  const targetInternCount = Math.min(5, internships.length);
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
    ['S.No', 'Job Title', 'Company Name', 'Location', 'Experience', 'LinkedIn Apply Link'].map(escapeCsv).join(',')
  ];

  selectedJobs.forEach((job, index) => {
    const exp = getExperience(job);
    csvRows.push([
      index + 1,
      job.title || '',
      job.companyName || '',
      job.location || 'India',
      exp,
      job.link.split('?')[0] || ''
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
          🚀 Daily Top Product Companies Jobs (${dateStr})
        </h2>
        <p style="color: #475569; font-size: 15px;">
          Hi Syed, here are today's fresh developer and internship openings strictly filtered from the <strong>Top 80 Product-Based Companies</strong> in India.
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
      subject: `🎯 [Top 80 Product Companies] Daily Developer Jobs (${dateStr})`,
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
