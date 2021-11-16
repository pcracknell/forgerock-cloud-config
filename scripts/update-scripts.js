const fs = require('fs')
const path = require('path')
const getSessionToken = require('../helpers/get-session-token')
const fidcRequest = require('../helpers/fidc-request')
const fileFilter = require('../helpers/file-filter')
const uglifyJS = require('uglify-js')

const updateScripts = async (argv) => {
  const { realm } = argv
  const { FIDC_URL, filenameFilter } = process.env

  try {
    const sessionToken = await getSessionToken(argv)

    const dir = path.resolve(__dirname, '../config/am-scripts')
    const useFF = filenameFilter || argv.filenameFilter

    const scriptFileContent = fs
      .readdirSync(dir)
      .filter((name) => path.extname(name) === '.json') // Filter out any non JSON files
      .map((filename) => require(path.join(dir, filename))) // Map JSON file content to an array

    let libraryFunctionsScriptMinified = getLibraryFunctionsScriptMinified(dir)

    // Update each script
    await Promise.all(
      scriptFileContent.map(async (scriptFile) => {
        const baseUrl = `${FIDC_URL}/am/json/realms/root/realms/${realm}`
        await Promise.all(
          scriptFile.scripts.map(async (script) => {
            if (!fileFilter(script.filename, useFF)) {
              return
            }

            if (!script.payload.name || script.payload.name.trim() === '') {
              throw new Error(`ERROR script Id : ${script.payload._id} must have a valid (non-blank) name!`)
            }

            // updates the script content with encoded file
            const originalScript = fs.readFileSync(
              `${dir}/scripts-content/${script.filename}`,
              { encoding: 'utf-8' }
            )

            const mergedScript = libraryFunctionsScriptMinified ?
              mergeOriginalWithLibraryFunctionsScriptMinified(originalScript, libraryFunctionsScriptMinified)
              : originalScript

            script.payload.script = Buffer.from(mergedScript).toString('base64')

            console.log(`updating script : ${script.payload.name} (${script.filename})`)
            const requestUrl = `${baseUrl}/scripts/${script.payload._id}`

            return await fidcRequest(
              requestUrl,
              script.payload,
              sessionToken,
              true
            )
          })
        )

        console.log('scripts updated')
        return Promise.resolve()
      })
    )
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }

  function mergeOriginalWithLibraryFunctionsScriptMinified (originalScript, libraryScriptMinified) {
    if (!originalScript || !libraryScriptMinified) {
      return originalScript
    }

    const LIBRARY_START = '// LIBRARY START'
    const LIBRARY_END = '// LIBRARY END'

    const startMarker = originalScript.indexOf(LIBRARY_START)
    const endMarker = originalScript.indexOf(LIBRARY_END)

    if (startMarker === -1 || endMarker === -1 || endMarker <= startMarker) {
      return originalScript
    }

    originalScript = originalScript.substring(0, startMarker + LIBRARY_START.length)
      .concat('\n').concat(libraryScriptMinified).concat('\n')
      .concat(originalScript.substring(endMarker))

    return originalScript
  }

  function getLibraryFunctionsScriptMinified (dir) {
    const libraryFunctionsFile = `${dir}/scripts-library/ch-library-functions.js`

    if (fs.existsSync(libraryFunctionsFile)) {
      const libraryFunctionsScript = fs.readFileSync(
        libraryFunctionsFile,
        { encoding: 'utf-8' }
      )

      if (libraryFunctionsScript) {
        const uglified = uglifyJS.minify(libraryFunctionsScript, {
          output: {
            max_line_len: 140
          }
        })

        if (uglified.error) {
          throw new Error('Failed to minify Library Functions Script!')
        }

        return uglified.code
      }
    }

    return undefined
  }
}

module.exports = updateScripts
