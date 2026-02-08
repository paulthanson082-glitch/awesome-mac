import { toVFile } from 'to-vfile'
import { remark } from 'remark'
import gfm from 'remark-gfm'
import FS from 'fs-extra'

// Compile regex patterns once at module level for better performance
const ICON_PATTERNS = {
  ANY: /^(freeware\s+icon|oss\s+icon|app-store\s+icon|awesome-list\s+icon)/i,
  FREEWARE: /^freeware\s+icon/i,
  OSS: /^oss\s+icon/i,
  APP_STORE: /^app-store\s+icon/i,
  AWESOME_LIST: /^awesome-list\s+icon/i
}

const WHITESPACE_REGEX = /\s/g
const MARK_TEXT_REGEX = /^([\s]+)?-\s/

const getHeadingText = (arr = []) => {
  let title = ''
  arr.forEach(child => {
    if (typeof child.value === 'string') {
      title += child.value
    }
    if (child.children && Array.isArray(child.children)) {
      title += getHeadingText(child.children)
    }
  })
  return title
}

const getSoftwareName = (obj, result = { title: '' }) => {
  if (obj.value) {
    result.title += obj.value
  }
  if (obj.url) {
    result.url = obj.url
  }
  if (obj.type === 'delete') {
    result.delete = true
  }
  if (obj.children && Array.isArray(obj.children)) {
    obj.children.forEach(child => {
      result = getSoftwareName(child, result)
    })
  }
  return result
}

const getIconDetail = (data, url = '') => {
  if (data.type === 'imageReference' && data.identifier) {
    const identifier = data.identifier.toLowerCase()
    if (ICON_PATTERNS.ANY.test(identifier)) {
      let type = ''
      if (ICON_PATTERNS.FREEWARE.test(identifier)) {
        type = 'freeware'
      } else if (ICON_PATTERNS.OSS.test(identifier)) {
        type = 'oss'
      } else if (ICON_PATTERNS.APP_STORE.test(identifier)) {
        type = 'app-store'
      } else if (ICON_PATTERNS.AWESOME_LIST.test(identifier)) {
        type = 'awesome-list'
      }
      return { type, url }
    }
    return false
  }
}

/**
 * ```markdown
 * * [Atom](https://atom.io) - xxxxxxx. [![Open-Source Software][OSS Icon]](https://xxx) ![Freeware][Freeware Icon] [![Awesome List][awesome-list Icon]](https://xxx)
 * ```
 */
const getMarkIcons = (arr = [], parent = {}) => {
  let mark = { icons: [] }
  if (arr && Array.isArray(arr) && arr[1] && arr[1].type === 'text' && MARK_TEXT_REGEX.test(arr[1].value)) {
    mark = { ...mark, ...getSoftwareName(arr[0]) }
    arr = arr.filter(child => {
      const data = getIconDetail(child)
      if (data) {
        mark.icons.push(data)
        return false
      }
      if (child.type === 'link' && child.children && Array.isArray(child.children)) {
        let hasIcons = false
        child.children.forEach(d => {
          const iconDetail = getIconDetail(d)
          if (iconDetail) {
            mark.icons.push(getIconDetail(d, child.url))
            hasIcons = true
          }
        })
        if (hasIcons) {
          return false
        }
      }
      if (child.type === 'text' && child.value.replace(WHITESPACE_REGEX, '') === '') {
        return false
      }
      return true
    });
  }
  return { children: [...arr], mark: { ...mark } }
}

const getMdToAST = (data = [], parent = {}) => {
  data = data.filter((m) => m.type !== 'html').map((child) => {
    if (child.position) {
      delete child.position
      if (child.type === 'listItem') { 
        delete child.checked
        delete child.spread;
      }
      if (child.type === 'paragraph' && parent.type === 'listItem') {
        const result = getMarkIcons(child.children, child)
        child = { ...child, ...result }
      }
      if (child.type === 'heading') {
        child.value = getHeadingText(child.children)
        delete child.children
      }
    }
    if (child.children && Array.isArray(child.children)) {
      child.children = getMdToAST(child.children, child)
    }
    return child
  })
  return data
}

/**
 * Process a markdown file and generate JSON output
 * @param {string} inputFile - Path to input markdown file
 * @param {string} outputFile - Path to output JSON file
 */
const processMarkdownFile = (inputFile, outputFile) => {
  remark()
    .use(gfm)
    .use(() => (tree) => {
      const startIndex = tree.children.findIndex(item => item.type === 'html' && /<!--start-->/.test(item.value))
      const endIndex = tree.children.findIndex(item => item.type === 'html' && /<!--end-->/.test(item.value))
      const data = tree.children.slice(startIndex + 1, endIndex)
      const dataAST = getMdToAST([...data])
      FS.outputJsonSync(outputFile, dataAST)
      console.log(` create file: \x1b[32;1m ${outputFile} \x1b[0m`);
    })
    .processSync(toVFile.readSync(inputFile))
}

// Process both markdown files
processMarkdownFile('README.md', './dist/awesome-mac.json')
processMarkdownFile('README-zh.md', './dist/awesome-mac.zh.json')
