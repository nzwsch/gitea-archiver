namespace Gitea {
  export interface User {
    login: string
  }

  export interface Repo {
    cloneUrl: string
    name: string
    owner: User
  }

  export interface CommitUser {
    name: string
    email: string
    date: string
  }

  export interface Commit {
    sha: string
    commit: {
      author: CommitUser
      committer: CommitUser
    }
  }
}
