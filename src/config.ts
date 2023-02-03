import * as core from '@actions/core'
import yaml from 'js-yaml'
import fs from 'fs'

interface Group {
  name: string
  reviewers?: number
  internal_reviewers?: number
  usernames: string[]
}
export interface Config {
  groups: Group[]
}

export const getConfig = (): Config => {
  const configPath = core.getInput('config', {required: true})

  try {
    // @ts-ignore
      const config = yaml.safeLoad(fs.readFileSync(configPath, 'utf8')) as Config

    for (const group of config.groups) {
      if (!group.reviewers && !group.internal_reviewers) {
        throw new Error(
          'One of `reviewers` or `internal_reviewers` should be set'
        )
      }
    }

    return config
  } catch (error) {
    // @ts-ignore
      core.setFailed(error.message)
  }

  return {groups: []}
}
