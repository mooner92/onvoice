Run PowerShell as Administrator and then execute(Windows OS)

> `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

Then,

> `npm install -g pnpm`

Then, in my code directory, run

> pnpm install

Next step is,

> pnpm dev

This will allow me to open localhost:3000

## Change Branch

### Create Branch

1.move to parent parent branch

> `git checkout develop`

2.Create the branch under the parent branch

> `git checkout -b feat/summary-chatbot`

3.Except: create directly hotfix branch to main branch

> `git checkout main`<br>
> `git checkout -b hotfix/login-error`

### Branch merge rule

Our team only use merge method not rebase method.
When there are change things at parent branch.

1.when main was changed.

> `git fetch origin`<br>
> `git checkout [my-branch]` <br>
> `git merge origin/main`

2.when develop was changed.

> `git fetch origin`<br>
> `git checkout [my-branch]`<br>
> `git merge origin/develop`

# Don't push to the main branch directly.
