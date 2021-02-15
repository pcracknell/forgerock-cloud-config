const fetch = require('node-fetch')
const path = require('path')
const fs = require('fs')
const getAccessToken = require('../../helpers/get-access-token')

const updateConnectorMappings = async (argv) => {
  // Check environment variables
  const { FIDC_URL, PHASE = '0' } = process.env

  if (!FIDC_URL) {
    console.error('Missing FIDC_URL environment variable')
    return process.exit(1)
  }

  try {
    const accessToken = await getAccessToken(argv)

    console.log(`Using phase ${PHASE} config`)

    const dir = path.resolve(
      __dirname,
      `../../config/phase-${PHASE}/connectors/mappings`
    )

    const mappingFilesContent = fs
      .readdirSync(`${dir}`)
      .filter((name) => path.extname(name) === '.json') // Filter out any non JSON files
      .map((filename) => require(path.join(`${dir}`, filename))) // Map JSON file content to an array

    const requestUrl = `${FIDC_URL}/openidm/config/sync`

    const requestOptions = {
      method: 'put',
      body: JSON.stringify({
        mappings: mappingFilesContent
      }),
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json'
      }
    }
    const { status, statusText } = await fetch(requestUrl, requestOptions)
    if (status > 299) {
      throw new Error(`${status}: ${statusText}`)
    }
    console.log('Connector mappings updated')
    return Promise.resolve()
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}

module.exports = updateConnectorMappings
