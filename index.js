/* ================================================================================

	notion-github-sync.

  Glitch example: https://glitch.com/edit/#!/notion-github-sync
  Find the official Notion API client @ https://github.com/makenotion/notion-sdk-js/

================================================================================ */

const { Client } = require("@notionhq/client")
const dotenv = require("dotenv")
const { Octokit } = require("octokit")

dotenv.config()
const octokit = new Octokit({ auth: process.env.GITHUB_KEY })
const notion = new Client({ auth: process.env.NOTION_KEY })

// const databaseId = process.env.NOTION_DATABASE_ID
const REPORT_START_DATE = process.env.REPORT_START_DATE
const QUERY = `is:issue+repo:cypress-io/cypress+created:>=${REPORT_START_DATE}+-label:"stage: internal"+label:E2E-auth,E2E-core,CT,DX,"external: dashboard"`
const encodedQuery = `is%3Aissue+repo%3Acypress-io%2Fcypress+created%3A>%3D${REPORT_START_DATE}+-label%3A"stage%3A+internal"+label%3AE2E-auth%2CE2E-core%2CCT%2CDX%2C"external%3A+dashboard"+`
const SECTIONS = [
  'CT',
  'E2E-core',
  'E2E-auth',
  'DX',
  'external: dashboard'
]


/**
 * Initialize local data store.
 * Then sync with GitHub.
 */
syncNotionDatabaseWithGitHub()

/**
 * Get and set the initial data store with issues currently in the database.
 */

async function syncNotionDatabaseWithGitHub() {
  // Get all issues currently in the provided GitHub repository.
  console.log("\nFetching issues from Notion DB...")
  const issues = await getGitHubIssuesForRepository()
  console.log(`Fetched ${issues.length} issues from GitHub repository.`)

  // Create page for for report
  const response = await createReportPage(issues)
  console.log(`Successfully generated Report at ${response.url}`)
}

 function sortIssues(issues) {
  const sectionsObj = SECTIONS.reduce((acc, section) => {
    acc[section] = {
      Enhancements: [],
      Bugs: [],
      Uncategorized: [],
    }

    return acc
  }, {})
  return issues.reduce((acc, issue) => {
    const labels = issue.labels.map((label) => label.name)
    const section = SECTIONS.reduce((acc, section) => {
      if (labels.includes(section)){
        return section
      }
      return acc
    }, undefined)

    if (labels.includes('type: bug')){
      acc[section].Bugs.push(issue)
    } else if (labels.includes('type: enhancement')){
      acc[section].Enhancements.push(issue)
    } else {
      acc[section].Uncategorized.push(issue)
    }
    return acc
  }, sectionsObj)
 }

 function generateSection(section, issues) {

  let blocks = [
    {
      object: "block",
      type: "heading_1",
      heading_1: {
        rich_text: [{type: 'text', text: {content: section}}]
      },
    }
  ]
  Object.entries(issues).forEach(([subSection, subSectionIssues]) => {
    if (subSectionIssues.length > 0){
      blocks.push({
        object: "block",
        type: "heading_2",
        heading_2: {
          rich_text: [{type: 'text', text: {content: subSection}}]
        },
      })
      blocks.push({
        object: "block",
        type: "table",
        table: {
          has_column_header: true,
          has_row_header: false,
          table_width: 5,
          children: [
            {
              type: 'table_row',
              table_row: {
                cells: [
                  [{
                    type: 'text',
                    text: {
                      content: 'Title',
                    }
                  }], [{
                    type: 'text',
                    text: {
                      content: 'Link',
                    }
                  }], [{
                    type: 'text',
                    text: {
                      content: 'Status',
                    }
                  }], [{
                    type: 'text',
                    text: {
                      content: 'Labels',
                    }
                  }], [{
                    type: 'text',
                    text: {
                      content: 'Notes',
                    }
                  }]
                ]
              }
            },
            ...subSectionIssues.map((issue) => {
              return {
                type: 'table_row',
                table_row: {
                  cells: [
                    [{
                      type: 'text',
                      text: {
                        content: issue.title,
                      }
                    }], [{
                      type: 'text',
                      text: {
                        content: `#${issue.number}`,
                        link: {
                          type: 'url',
                          url: issue.url,
                        }
                      }
                    }], [{
                      type: 'text',
                      text: {
                        content: issue.state,
                      }
                    }], [{
                      type: 'text',
                      text: {
                        content: issue.labels.map((label) => label.name).join(', '),
                      }
                    }], [{
                      type: 'text',
                      text: {
                        content: '',
                      }
                    }]
                  ]
                }
              }
            })
          ]
        }
      })
    }
  })


  // Add Divider
  blocks.push({
    type: "divider",
    divider: {}
  })

  return blocks
 }

async function createReportPage(issues) {
  const today = new Date()
  const sortedIssues = sortIssues(issues)

  const response = await notion.search({
    query: 'Firewatch Reports Database',
  })

  const databaseId = response.results[0].id

  return notion.pages.create({
  parent: { database_id: databaseId },
  properties: {
      Name: {
          title: [{ type: "text", text: { content: `Sprint beginning: ${REPORT_START_DATE}` } }],
      },
      'Github Query': {rich_text:[{
        type: 'text',
        text: {
          content: `Link`,
          link: {
            type: 'url',
            url: `https://github.com/issues?q=${encodedQuery}`,
          }
        }
      }]},
      Created: {
        date: {start: today.toISOString()},
      }
  },
  children: SECTIONS.reduce((acc, section) => acc.concat(generateSection(section, sortedIssues[section])),[])})
}



/**
 * Gets issues from a GitHub repository. Pull requests are omitted.
 *
 * https://docs.github.com/en/rest/guides/traversing-with-pagination
 * https://docs.github.com/en/rest/reference/issues
 *
 * @returns {Promise<Array<{ number: number, title: string, state: "open" | "closed", comment_count: number, url: string }>>}
 */
async function getGitHubIssuesForRepository() {
  const issues = []
  const iterator = octokit.paginate.iterator(octokit.rest.search.issuesAndPullRequests, {
    q: QUERY,
    per_page: 100,
  })
  for await (const { data } of iterator) {
    for (const issue of data) {
      if (!issue.pull_request) {
        const labels = issue.labels.map((label) => ({
          name: label.name,
          url: label.url,
        }))
        issues.push({
          number: issue.number,
          title: issue.title,
          state: issue.state,
          comment_count: issue.comments,
          url: issue.html_url,
          labels,
        })
      }
    }
  }
  return issues
}
