/// <reference path="Gitea.ts" />

import 'dotenv/config'

import { DateTime } from 'luxon'
import { promisify } from 'util'
import axios from 'axios'
import ck from 'camelcase-keys'
import ProgressBar from 'progress'

const GITEA_HOST = process.env.GITEA_HOST
const GITEA_TOKEN = process.env.GITEA_TOKEN
const FILTER_KEYWORDS = `${process.env.FILTER_KEYWORDS}`.split(',')
const SLEEP_DURATION = parseInt(process.env.SLEEP_DURATION || '500')
const TRANSFER_OWNER = process.env.TRANSFER_OWNER

const sleep = promisify(setTimeout)

axios.defaults.baseURL = GITEA_HOST
axios.defaults.headers.common['Authorization'] = `token ${GITEA_TOKEN}`

/**
 * Internal Interfaces
 */

interface Repo {
  cloneUrl: string
  name: string
  ownerName: string
  repoName: string
}

interface Commit {
  created: number
  date: string
  sha: string
}

interface CommitWithFormatDate extends Commit {
  format: string
}

interface RepoWithRenamed extends Repo {
  renamedRepoName: string
}

/**
 * Convert server responses to camelCase.
 */
axios.interceptors.response.use((response) => {
  if (
    response.data &&
    response.headers['content-type'].match('application/json')
  ) {
    response.data = ck(response.data)
  }

  return response
})

/**
 * Getting a list of repositories from the Gitea server
 *
 * @returns Repository List
 */
async function fetchAllRepositories(): Promise<Gitea.Repo[]> {
  const allRepos: Gitea.Repo[] = []
  const limit = 20
  let page = 1
  let repos: Gitea.Repo[] = []
  do {
    const res = await axios.get<Gitea.Repo[]>(
      `/user/repos?page=${page}&limit=${limit}`
    )
    repos = res.data
    allRepos.push(...repos)
    page++
    await sleep(SLEEP_DURATION)
  } while (repos.length === limit)

  return allRepos
}

/**
 * List of repositories with pre-defined keywords excluded.
 *
 * @param repos - List of repositories that have been retrieved
 * @returns List of repositories with specific keywords excluded.
 */
function getTargetRepos(repos: Gitea.Repo[]): Gitea.Repo[] {
  const filteredRepos = repos.filter((repo) =>
    FILTER_KEYWORDS.some((keyword) => repo.name.match(keyword))
  )
  const filteredNames = filteredRepos.map((repo) => repo.name)

  return repos.filter((repo) => filteredNames.indexOf(repo.name) < 0)
}

/**
 * An array that extracts only the necessary information from the repository retrieved from Gitea.
 *
 * @param giteaRepos - An array of Gitea repositories
 * @returns An array of repositories
 */
function getRepos(giteaRepos: Gitea.Repo[]): Repo[] {
  const name = (repo: Gitea.Repo) => {
    let words = repo.name.split('-')
    if (words[words.length - 1].match(/^\d+/)) {
      return words.slice(0, words.length - 1).join('-')
    } else {
      return words.join('-')
    }
  }

  return giteaRepos.map((repo) => ({
    repoName: repo.name,
    ownerName: repo.owner.login,
    name: name(repo),
    cloneUrl: repo.cloneUrl,
  }))
}

/**
 * Get a list of commits from the specified repository.
 *
 * @param repo - Repository to get a list of commits
 * @returns List of commits
 */
async function fetchCommitsPromise(repo: Repo): Promise<Gitea.Commit[]> {
  const baseURL = `/repos/${repo.ownerName}/${repo.repoName}/commits`
  const allCommits: Gitea.Commit[] = []
  const limit = 20
  let page = 1
  let hasmore = true
  while (hasmore || page > 100) {
    const url = `${baseURL}?page=${page}&limit=${limit}`
    const res = await axios.get<Gitea.Commit[]>(url)
    allCommits.push(...res.data)
    page++
    hasmore = res.headers['x-hasmore'] === 'true'
    await sleep(SLEEP_DURATION)
  }

  return allCommits
}

/**
 * Return a commit with the project timestamp from a single commit
 *
 * @param commit - A commit
 * @returns A commit with timestamps
 */
function getCommitWithFormatDate(commit: Commit): CommitWithFormatDate {
  const date = new Date(commit.created)
  const dt = DateTime.fromJSDate(date, { zone: 'Asia/Tokyo' })
  const format = dt.toFormat('yyyyLLdd')

  return { ...commit, format }
}

/**
 * Return the first commit in the list of commits.
 *
 * @param giteaCommits - List of commits in Gitea
 * @returns Commits with timestamps
 */
function getVeryFirstCommit(
  giteaCommits: Gitea.Commit[]
): CommitWithFormatDate {
  const commits: Commit[] = []
  giteaCommits.forEach(({ sha, commit }) => {
    if (commit.author.date !== commit.committer.date) {
      commits.push({
        sha,
        date: commit.committer.date,
        created: Date.parse(commit.committer.date),
      })
    }
    commits.push({
      sha,
      date: commit.author.date,
      created: Date.parse(commit.author.date),
    })
  })
  const sortedCommits = commits.sort((a, b) => a.created - b.created)
  const firstCommit = sortedCommits[0]

  return getCommitWithFormatDate(firstCommit)
}

/**
 * Return the repository with renaming information.
 *
 * @param repo - Repository
 * @returns A repository containing renaming information
 */
async function getRepoWithRenamed(repo: Repo): Promise<RepoWithRenamed> {
  const commits = await fetchCommitsPromise(repo)
  const commit = getVeryFirstCommit(commits)

  return { ...repo, renamedRepoName: `${repo.name}-${commit.format}` }
}

/**
 * Rename the repository and change the configuration.
 *
 * @param repo - A repository containing renaming information
 */
async function postRenameRepository(repo: RepoWithRenamed) {
  const url = `/repos/${repo.ownerName}/${repo.repoName}`
  await axios.patch(url, {
    name: repo.renamedRepoName,
    archived: true,
    description: '',
    has_issues: false,
    has_projects: false,
    has_pull_requests: false,
    has_wiki: false,
    internal_tracker: {
      allow_only_contributors_to_track_time: false,
      enable_issue_dependencies: false,
      enable_time_tracker: false,
    },
    private: false,
    template: false,
    website: '',
  })
  await sleep(SLEEP_DURATION)
}

/**
 * Perform a transfer of the repository specified by Gitea.
 *
 * @param repo - A repository containing renaming information
 */
async function postRepositoryTransfer(repo: RepoWithRenamed) {
  const url = `/repos/${repo.ownerName}/${repo.renamedRepoName}/transfer`
  await axios.post(url, {
    new_owner: TRANSFER_OWNER,
  })
  await sleep(SLEEP_DURATION)
}

/**
 * Renaming and moving a specific repository from the Gitea project list
 */
async function main() {
  const giteaRepos: Gitea.Repo[] = await fetchAllRepositories()
  const targetRepos: Gitea.Repo[] = getTargetRepos(giteaRepos)
  const repos: Repo[] = getRepos(targetRepos)
  const bar = new ProgressBar(':bar :current/:total', {
    width: 20,
    total: repos.length * 3,
  })
  bar.tick(0)
  for (const repo of repos) {
    const renamed = await getRepoWithRenamed(repo)
    bar.tick()
    await postRenameRepository(renamed)
    bar.tick()
    await postRepositoryTransfer(renamed)
    bar.tick()
  }
}

main()
