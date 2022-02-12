# gitea-archiver

> Transfers the Gitea repository to the specified account

## Install

```
$ git clone https://github.com/nzwsch/gitea-archiver.git
$ cd gitea-archiver
$ npm install
```

## Usage

```
$ npm start
```

## Environment variables

Environment variables can be passed to the program with dotenv. Duplicate the
`.env.sample` file included in this repository and rename it to a file called
`.env`. Since `.env` is not part of the repository, it will not affect the main
program.

```
GITEA_HOST=https://<Hostname of Gitea>/api/v1
GITEA_TOKEN=<Access Tokens>

# If the repository contains apple banana cherry grape, it will be skipped.
FILTER_KEYWORDS=apple,banana,cherry,grape

# Change the amount of weight a server request will take. If you specify 1000,
# the next request will be executed in about 1 second. Note that the shorter it
# is, the faster it will be processed, but the server will be overloaded.
SLEEP_DURATION=1000

# Forward to the user with the account specified here. Note that we do not check
# whether the user exists or not.
TRANSFER_OWNER=archiver
```

## Links

- https://v5.seiichiyonezawa.com/posts/gitea-archiver/

---

Translated with www.DeepL.com/Translator (free version)
