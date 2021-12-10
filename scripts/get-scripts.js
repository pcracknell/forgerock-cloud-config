const fs = require('fs')
const path = require('path')
const getSessionToken = require('../helpers/get-session-token')
const fidcGet = require('../helpers/fidc-get')

const scriptExtensions = ['.js', '.groovy']

const getScripts = async (argv) => {
  const { realm } = argv
  const { FIDC_URL } = process.env

  try {
    const sessionToken = await getSessionToken(argv)

    const dir = path.resolve(__dirname, '../config/am-scripts')
    const scriptsDir = path.resolve(dir, 'scripts-content')

    // Create an array of all persisted scripts
    const scriptFileContent = fs
      .readdirSync(scriptsDir)
      .filter((name) => scriptExtensions.includes(path.extname(name))) // Filter out any non script files
      .map((filename) => path.join(scriptsDir, filename)) // Create full paths

    // Delete all existing scripts
    await Promise.all(scriptFileContent.map(fs.unlinkSync))

    const baseUrl = `${FIDC_URL}/am/json/realms/root/realms/${realm}/scripts?_queryFilter=true`
    const { result } = await fidcGet(baseUrl, sessionToken, true)

    const mappedResults = result.map(rawConfig => {
      const scriptBase64 = rawConfig.script
      let fileExtension
      if (rawConfig.language === 'JAVASCRIPT') fileExtension = 'js'
      else if (rawConfig.language === 'GROOVY') fileExtension = 'groovy'
      else throw new Error(`Unexpected language ${rawConfig.language} encountered`)

      const filename = rawConfig.name.replace(/ /g, '-').toLowerCase() + '.' + fileExtension
      fs.writeFileSync(`${dir}/scripts-content/${filename}`, Buffer.from(scriptBase64, 'base64'))

      return {
        payload: { ...rawConfig, script: '<replace>' },
        filename: filename
      }
    })

    const outputConfig = { scripts: mappedResults }
    const configPath = path.resolve(__dirname, `${dir}/scripts-config.json`)

    await fs.writeFile(configPath, JSON.stringify(outputConfig, null, 4))

    console.log('Scripts persisted')
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}

module.exports = getScripts
