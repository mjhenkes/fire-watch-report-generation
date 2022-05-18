# Fire watch report generation

This project generates a fire watch report from github issues to notion.

## Step 1

Add an .env file containing:

```env
GITHUB_KEY=<super secret only needs read access>
NOTION_KEY=<also super secret needs write and create access>
REPORT_START_DATE=<The date you with the report to start with in YYYY-MM-DD format>
```

## Step 2

run `node index.js`
