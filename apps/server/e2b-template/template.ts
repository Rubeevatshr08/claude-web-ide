import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Template, waitForPort } from 'e2b'

const templateDir = dirname(fileURLToPath(import.meta.url))
const dockerfileContent = readFileSync(join(templateDir, 'e2b.Dockerfile'), 'utf8')

export const template = Template({
  fileContextPath: templateDir,
  fileIgnorePatterns: ['node_modules', '.git'],
})
  .fromDockerfile(dockerfileContent)
  .setStartCmd(
    'cd /home/user/workspace && sleep 5 && CHOKIDAR_USEPOLLING=true NODE_OPTIONS=--max-old-space-size=1536 npm run dev -- --hostname 0.0.0.0 --port 3000',
    waitForPort(3000)
  )
