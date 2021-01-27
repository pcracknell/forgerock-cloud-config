const fetch = require('node-fetch')
const fs = require('fs')
const path = require('path')
const getSessionToken = require('../../helpers/get-session-token')
const updateNode = require('./update-node')

const updateAuthTrees = async (argv) => {
  const { realm } = argv

  // Check environment variables
  const { FIDC_URL, FIDC_COOKIE_NAME, PHASE = '0' } = process.env

  if (!FIDC_URL || !FIDC_COOKIE_NAME) {
    console.error('Missing required environment variable(s)')
    return process.exit(1)
  }

  try {
    const sessionToken = await getSessionToken(argv)

    console.log(`Using phase ${PHASE} config`)

    // Read auth tree JSON files
    const dir = path.resolve(
      __dirname,
      `../../config/phase-${PHASE}/auth-trees`
    )

    const authTreesFileContent = fs
      .readdirSync(dir)
      .filter((name) => path.extname(name) === '.json') // Filter out any non JSON files
      .map((filename) => require(path.join(dir, filename))) // Map JSON file content to an array

    // Update each auth tree
    await Promise.all(
      authTreesFileContent.map(async (authTreeFile) => {
        if (!authTreeFile.tree._id) {
          return Promise.reject(new Error('Missing _id in auth tree config'))
        }
        const baseUrl = `${FIDC_URL}/am/json${realm}/realm-config/authentication/authenticationtrees`
        const cookieHeader = `${FIDC_COOKIE_NAME}=${sessionToken}`
        await Promise.all(
          authTreeFile.nodes.map(async (node) => {
            return await updateNode(baseUrl, cookieHeader, node)
          })
        )
        console.log('nodes updated')
        const requestUrl = `${baseUrl}/trees/${authTreeFile.tree._id}`
        const requestOptions = {
          method: 'put',
          body: JSON.stringify(authTreeFile.tree),
          headers: {
            'content-type': 'application/json',
            'x-requested-with': 'ForgeRock CREST.js',
            cookie: cookieHeader
          }
        }
        const { status, statusText } = await fetch(requestUrl, requestOptions)
        if (status > 299) {
          return Promise.reject(new Error(`${status}: ${statusText}`))
        }
        console.log(`${authTreeFile.tree._id} updated`)
        return Promise.resolve()
      })
    )
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}

module.exports = updateAuthTrees
