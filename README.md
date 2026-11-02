# automated-cronJob 🚀

Automated LinkedIn Job Hunting & Scraping Engine that runs daily on a schedule to discover fresh 24h engineering openings, filters for developer roles, and sends an HTML email digest with attached CSV spreadsheet directly to your inbox.

## Features
- **Targeted Scraping:** Pulls fresh listings posted within the last 24 hours.
- **Strict Role Filtering:** Exclusively targets Software Engineer, Full Stack, Frontend, Backend, React, Node.js, and SDE roles.
- **Automated Delivery:** 
  - Generates a timestamped `.csv` file in your `Downloads` folder.
  - Sends a clean HTML table with "Apply Now" buttons directly to your Gmail.
- **Dual Scheduling:**
  - **Local:** Windows Scheduled Task (via `scripts/setup_windows_cron.ps1`).
  - **Cloud:** GitHub Actions cron running every morning at 9:00 AM IST (`.github/workflows/daily_job_hunter.yml`).

## Quick Start (Manual Run)
```bash
npm install
node scripts/fetch_daily_jobs.js
```

## GitHub Actions Cloud Cron Setup
Add these repository secrets in GitHub under **Settings → Secrets and variables → Actions**:
1. `APIFY_TOKEN`: Your Apify API token
2. `GMAIL_APP_PASSWORD`: Your 16-letter Gmail App Password
