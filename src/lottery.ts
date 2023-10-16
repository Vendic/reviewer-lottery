import * as core from '@actions/core'
import {Octokit} from '@octokit/rest'
import {Config} from './config'

export interface Pull {
    user: {
        login: string
    }
    number: number
    draft: boolean
}
interface Env {
    repository: string
    ref: string,
    pull_number? : string
}

interface RequestReviewersResponse {
    status: number; // Replace with the actual property name and type
    data: {
        requested_reviewers: {
            login: string;
            id: number;
            node_id: string;
            avatar_url: string;
            gravatar_id: string;
            url: string;
            html_url: string;
            followers_url: string;
            following_url: string;
            gists_url: string;
            starred_url: string;
            subscriptions_url: string;
            organizations_url: string;
            repos_url: string;
            events_url: string;
            received_events_url: string;
            type: string;
            site_admin: boolean;
        }[];
    }
}


class Lottery {
    octokit: Octokit
    config: Config
    env: Env
    pr: Pull | undefined

    constructor({
                    octokit,
                    config,
                    env
                }: {
        octokit: Octokit
        config: Config
        env: Env
    }) {
        this.octokit = octokit
        this.config = config
        this.env = {
            repository: env.repository,
            ref: env.ref,
            pull_number: env.pull_number
        }
        this.pr = undefined
    }

    async run(): Promise<void> {
        try {
            const ready = await this.isReadyToReview()
            if (ready) {
                const reviewers = await this.selectReviewers()

                if (reviewers.length === 0) {
                    return;
                }

                const assignedReviewers = await this.setReviewers(reviewers) as RequestReviewersResponse

                core.debug(JSON.stringify(assignedReviewers));

                if (assignedReviewers.status == 200 && assignedReviewers.data.requested_reviewers.length > 0) {
                    core.info(`Assigned reviewers: ${assignedReviewers.data.requested_reviewers.map((reviewer) => reviewer.login).join(', ')}`)
                    core.setOutput('reviewers', assignedReviewers.data.requested_reviewers.map((reviewer) => reviewer.login).join(','))
                }
            }
        } catch (error) {
            // @ts-ignore
            core.error(error)
            // @ts-ignore
            core.setFailed(error)
        }
    }

    async isReadyToReview(): Promise<boolean> {
        try {
            const pr = await this.getPR()
            return !!pr && !pr.draft
        } catch (error) {
            // @ts-ignore
            core.error(error)
            // @ts-ignore
            core.setFailed(error)
            return false
        }
    }

    async setReviewers(reviewers: string[]): Promise<object> {
        const ownerAndRepo = this.getOwnerAndRepo()
        const pr = this.getPRNumber()

        return this.octokit.pulls.requestReviewers({
            ...ownerAndRepo,
            pull_number: pr, // eslint-disable-line @typescript-eslint/camelcase
            reviewers: reviewers.filter((r: string | undefined) => !!r)
        })
    }

    async selectReviewers(): Promise<string[]> {
        let selected: string[] = []
        const author = await this.getPRAuthor()

        try {
            for (const {
                reviewers,
                internal_reviewers: internalReviewers,
                usernames
            } of this.config.groups) {
                const reviewersToRequest =
                    usernames.includes(author) && internalReviewers
                        ? internalReviewers
                        : reviewers

                if (reviewersToRequest) {
                    selected = selected.concat(
                        this.pickRandom(usernames, reviewersToRequest, author)
                    )
                }
            }
        } catch (error) {
            // @ts-ignore
            core.error(error)
            // @ts-ignore
            core.setFailed(error)
        }

        return selected
    }

    pickRandom(items: string[], n: number, ignore: string): string[] {
        const picks: string[] = []

        const candidates = items.filter(item => item !== ignore)

        while (picks.length < n) {
            const random = Math.floor(Math.random() * candidates.length)
            const pick = candidates.splice(random, 1)[0]

            if (!picks.includes(pick)) picks.push(pick)
        }

        return picks
    }

    async getPRAuthor(): Promise<string> {
        try {
            const pr = await this.getPR()

            return pr ? pr.user.login : ''
        } catch (error) {
            // @ts-ignore
            core.error(error)
            // @ts-ignore
            core.setFailed(error)
        }

        return ''
    }

    getOwnerAndRepo(): { owner: string; repo: string } {
        const [owner, repo] = this.env.repository.split('/')

        return {owner, repo}
    }

    getPRNumber(): number {
        return Number(this.pr?.number)
    }

    async getPR(): Promise<Pull | undefined> {
        if (this.pr) return this.pr

        if (this.env.pull_number !== undefined) {
            try {
                const {data} = await this.octokit.pulls.get({
                    ...this.getOwnerAndRepo(),
                    pull_number: Number(this.env.pull_number)
                })

                if (!data ) {
                    throw new Error(`PR not found: ${this.env.pull_number}`)
                }

                // @ts-ignore
                this.pr = data

                return this.pr
            } catch (error) {
                // @ts-ignore
                core.error(error)
                // @ts-ignore
                core.setFailed(error)

                return undefined
            }
        }

        try {
            const {data} = await this.octokit.pulls.list({
                ...this.getOwnerAndRepo()
            })

            // @ts-ignore
            this.pr = data.find(({head: {ref}}) => ref === this.env.ref)

            if (!this.pr) {
                throw new Error(`PR matching ref not found: ${this.env.ref}`)
            }

            return this.pr
        } catch (error) {
            // @ts-ignore
            core.error(error)
            // @ts-ignore
            core.setFailed(error)

            return undefined
        }
    }
}

export const runLottery = async (
    octokit: Octokit,
    config: Config,
    env: Env = {
        repository: process.env.GITHUB_REPOSITORY || '',
        ref: process.env.GITHUB_HEAD_REF || '',
        pull_number: process.env.GITHUB_PULL_NUMBER
    }
): Promise<void> => {
    core.info(`Repository: ${env.repository}`)
    core.info(`Ref: ${env.ref}`)
    core.info(`Pull number: ${env.pull_number}`)

    const lottery = new Lottery({octokit, config, env})

    await lottery.run()
}
