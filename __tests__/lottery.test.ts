import {Octokit} from '@octokit/rest'
import * as core from '@actions/core'
import nock from 'nock'
import {runLottery, Pull} from '../src/lottery'
import fs from 'fs'
import {expect, test} from '@jest/globals'

const octokit = new Octokit()
const prNumber = 123
const ref = 'refs/pull/branch-name'
const basePull = {number: prNumber, head: {ref}}

const mockGetPull = (pull: Pull) =>
  nock('https://api.github.com')
    .get('/repos/uesteibar/repository/pulls')
    .reply(200, [pull])


test('selects reviewers from a pool of users, ignoring author using PR input', async () => {
    const pull = {
        ...basePull,
        user: {login: 'author'},
        draft: false
    }

    const outputMock = jest.spyOn(core, 'setOutput');

    const candidates = ['A', 'B', 'C', 'D', 'author']

    const response = JSON.parse(fs.readFileSync(__dirname + '/mocks/requested_reviewers_response.json', 'utf8'));

    const postReviewersMock = nock('https://api.github.com')
        .post(
            `/repos/uesteibar/repository/pulls/${prNumber}/requested_reviewers`,
            (body): boolean => {
                body.reviewers.forEach((reviewer: string) => {
                    expect(candidates).toContain(reviewer)
                    expect(reviewer).not.toEqual('author')
                })
                return true
            }
        )
        .reply(200, response)

    const prMock = nock('https://api.github.com')
        .get(`/repos/uesteibar/repository/pulls/${prNumber}`)
        .reply(200, pull)

    const config = {
        groups: [
            {
                name: 'Test',
                reviewers: 2,
                usernames: candidates
            }
        ]
    }

    await runLottery(octokit, config, {
        repository: 'uesteibar/repository',
        ref,
        pull_number: prNumber.toString()
    })

    expect(outputMock).toHaveBeenCalledWith('reviewers', 'A,B');

    postReviewersMock.done()
    prMock.done()

    nock.cleanAll()
})

test('selects reviewers from a pool of users, ignoring author', async () => {
  const pull = {
    ...basePull,
    user: {login: 'author'},
    draft: false
  }

  const getPullMock = mockGetPull(pull)

  const candidates = ['A', 'B', 'C', 'D', 'author']

  const postReviewersMock = nock('https://api.github.com')
    .post(
      `/repos/uesteibar/repository/pulls/${prNumber}/requested_reviewers`,
      (body): boolean => {
        body.reviewers.forEach((reviewer: string) => {
          expect(candidates).toContain(reviewer)
          expect(reviewer).not.toEqual('author')
        })
        return true
      }
    )
    .reply(200, pull)

  const config = {
    groups: [
      {
        name: 'Test',
        reviewers: 2,
        usernames: candidates
      }
    ]
  }

  await runLottery(octokit, config, {
    repository: 'uesteibar/repository',
    ref,
  })

  getPullMock.done()
  postReviewersMock.done()

  nock.cleanAll()
})

test("doesn't assign reviewers if the PR is in draft state", async () => {
  const pull = {
    ...basePull,
    user: {login: 'author'},
    draft: true
  }

  const getPullMock = mockGetPull(pull)

  const config = {
    groups: [
      {
        name: 'Test',
        reviewers: 2,
        usernames: ['A', 'B']
      }
    ]
  }

  await runLottery(octokit, config, {
    repository: 'uesteibar/repository',
    ref
  })

  getPullMock.done()
  nock.cleanAll()
})

test("doesn't send invalid reviewers if there is no elegible reviewers from one group", async () => {
  const pull = {
    ...basePull,
    user: {login: 'author'},
    draft: false
  }

  const getPullMock = mockGetPull(pull)

  const config = {
    groups: [
      {
        name: 'Test',
        reviewers: 1,
        usernames: ['A']
      },
      {
        name: 'Other group',
        reviewers: 1,
        usernames: ['author']
      }
    ]
  }

  const postReviewersMock = nock('https://api.github.com')
    .post(
      `/repos/uesteibar/repository/pulls/${prNumber}/requested_reviewers`,
      (body): boolean => {
        expect(body.reviewers).toEqual(['A'])

        return true
      }
    )
    .reply(200, pull)

  await runLottery(octokit, config, {
    repository: 'uesteibar/repository',
    ref
  })

  postReviewersMock.done()
  getPullMock.done()
  nock.cleanAll()
})

test('selects internal reviewers if configured and author belongs to group', async () => {
  const pull = {
    ...basePull,
    user: {login: 'author'},
    draft: false
  }

  const getPullMock = mockGetPull(pull)

  const candidates = ['A', 'B', 'C', 'D', 'author']

  const postReviewersMock = nock('https://api.github.com')
    .post(
      `/repos/uesteibar/repository/pulls/${prNumber}/requested_reviewers`,
      (body): boolean => {
        expect(body.reviewers).toHaveLength(1)

        body.reviewers.forEach((reviewer: string) => {
          expect(candidates).toContain(reviewer)
          expect(reviewer).not.toEqual('author')
        })
        return true
      }
    )
    .reply(200, pull)

  const config = {
    groups: [
      {
        name: 'Test',
        reviewers: 2,
        internal_reviewers: 1,
        usernames: candidates
      }
    ]
  }

  await runLottery(octokit, config, {
    repository: 'uesteibar/repository',
    ref
  })

  getPullMock.done()
  postReviewersMock.done()

  nock.cleanAll()
})

test("doesn't assign internal reviewers if the author doesn't belong to group", async () => {
  const pull = {
    ...basePull,
    user: {login: 'author'},
    draft: false
  }

  const getPullMock = mockGetPull(pull)

  const candidates = ['A', 'B', 'C', 'D']

  const postReviewersMock = nock('https://api.github.com')
    .post(
      `/repos/uesteibar/repository/pulls/${prNumber}/requested_reviewers`,
      (body): boolean => {
        expect(body.reviewers).toHaveLength(2)

        body.reviewers.forEach((reviewer: string) => {
          expect(candidates).toContain(reviewer)
          expect(reviewer).not.toEqual('author')
        })
        return true
      }
    )
    .reply(200, pull)

  const config = {
    groups: [
      {
        name: 'Test',
        reviewers: 2,
        internal_reviewers: 1,
        usernames: candidates
      }
    ]
  }

  await runLottery(octokit, config, {
    repository: 'uesteibar/repository',
    ref
  })

  getPullMock.done()
  postReviewersMock.done()

  nock.cleanAll()
})

test("doesn't assign reviewers if the author doesn't belong to group", async () => {
  const pull = {
    ...basePull,
    user: {login: 'author'},
    draft: false
  }

  const getPullMock = mockGetPull(pull)

  const candidates = ['A', 'B', 'C', 'D']

  const config = {
    groups: [
      {
        name: 'Test',
        internal_reviewers: 1,
        usernames: candidates
      }
    ]
  }

  await runLottery(octokit, config, {
    repository: 'uesteibar/repository',
    ref
  })

  getPullMock.done()

  nock.cleanAll()
})
