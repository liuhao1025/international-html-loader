/* eslint-disable */ 
var fs = require('fs')
var path = require('path')
var sh = require('shorthash')

// 默认生成文件的路径
var RESULT_FILE = 'result.json'
var UNHANDLED_RESULT_FILE = 'result-unhandled.json'
var PARSE_RESULT_FILE = 'parse-result.json'

var DEFAULT_QUERY = {
    mode: 'replace',
    outputPath: path.join(__dirname, '..', '..', 'i18n-result'),
    dictionaryFile: path.resolve(__dirname, '..', '..', 'src', 'portal', 'i18n', 'zh.json')
}
var I18N_ATTR_MAP = {
    'placeholder': true,
    'md-placeholder': true,
    'secondary-placeholder': true
}

// TODO 暴露对应的参数
var NODE_TEXT_REG = />([^<>]+)</mg
var NODE_START = /(<[a-zA-Z0-9\-]+\s+)([^>\/]*)(\s*\/?>)/mg
var NODE_ATTR_REG = /([a-zA-Z0-9\-]+)="([^"]+)"/mg
var ALPHABET_REG = /[a-zA-Z]/

var matchedResult = {}
var matchedExpressionResult = {}
// TODO 统计数据在增量编译时无法保持
var nodeTextCount = 0
var plainTextCount = 0
var expressionCount = 0
var partialExpressionCount = 0

var dictionary = null

function getDictionary (path) {
    if (!dictionary) {
        var exist = fs.existsSync(path)
        if (exist) {
            var data = fs.readFileSync(path)
            dictionary = JSON.parse(data)
        } else {
            dictionary = {}
        }
    }

    return dictionary
}

module.exports = function (content) {
    var query = Object.assign({}, DEFAULT_QUERY, this.query)
    var mode = query.mode
    var outputPath = query.outputPath
    var dic = mode === 'replace' ? getDictionary(query.dictionaryFile) : {}
    var rootContext = path.join(this.rootContext, 'src')
    var dirNames = path.relative(path.join(rootContext), this.context)
    var fileName = path.basename(this.resource).split('.')[0]
    dirNames = dirNames ? dirNames.split(path.sep) : []
    dirNames.push(fileName)
    // 提取可替换文本时使用的 key 值
    var dirKey = dirNames.join('.')
    
    // TODO 匹配部分标签属性
    var result = content.replace(NODE_TEXT_REG, function (matched, text) {
        // 移除首尾空格
        text = text.replace(/(^[\r\n\s]*)|([\r\n\s]*$)/g, '')
        var textKey = `${dirKey}.${sh.unique(text)}`

        // 空内容不需要处理
        if (!text) {
            return matched
        }
        // 未包含英文字母的内容不需要处理
        if (!ALPHABET_REG.test(text)) {
            return matched
        }
        nodeTextCount++

        // 完整的表达式暂时不进行处理
        if (text.startsWith('{{') && text.endsWith('}}')) {
            expressionCount++
            matchedExpressionResult[textKey] = text
            return matched
        }

        plainTextCount++
        
        matchedResult[textKey] = text
        var translate = dic[textKey]
        // 直接替换文本内容，方便处理文本和表达式的混合内容
        return translate && mode === 'replace' ? `>${ translate }<` : matched
    })

    result = result.replace(NODE_START, function (matched, prefix, content, suffix) {
        content = content.replace(NODE_ATTR_REG, function (matched, attr, text) {
            let translate = ''
            if (I18N_ATTR_MAP[attr]) {
                // 移除首尾空格
                text = text.replace(/(^[\r\n\s]*)|([\r\n\s]*$)/mg, '')
                let textKey = `${dirKey}.${attr}.${sh.unique(text)}`

                // 空内容不需要处理
                if (!text) {
                    return matched
                }
                // 未包含英文字母的内容不需要处理
                if (!ALPHABET_REG.test(text)) {
                    return matched
                }
                nodeTextCount++

                // 完整的表达式暂时不进行处理
                if (text.startsWith('{{') && text.endsWith('}}')) {
                    expressionCount++
                    matchedExpressionResult[textKey] = text
                    return matched
                }

                plainTextCount++
                
                matchedResult[textKey] = text
                translate = dic[textKey]
            }

            return translate ? `${attr}="${translate}"` : matched
        })
        return prefix + content + suffix
    })

    // export 模式下保存匹配到的信息
    if (mode === 'prereplace') {
        // 统计数据
        var parseResult = {
            nodeTextCount,
            expressionCount,
            partialExpressionCount,
            plainTextCount
        }

        // TODO 替换为异步版本并使用 this.async 完成异步操作的处理
        fs.writeFileSync(path.join(outputPath, RESULT_FILE), JSON.stringify(matchedResult))
        fs.writeFileSync(path.join(outputPath, UNHANDLED_RESULT_FILE), JSON.stringify(matchedExpressionResult))
        fs.writeFileSync(path.join(outputPath, PARSE_RESULT_FILE), JSON.stringify(parseResult))
    }
    return result
}