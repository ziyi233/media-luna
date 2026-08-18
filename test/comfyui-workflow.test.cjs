const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true
    },
    fileName: filename
  })
  module._compile(output.outputText, filename)
}

const {
  applyPromptInjectionMode,
  assignUploadedImages,
  injectPromptIntoWorkflow,
  normalizeImageCount,
  planImageAssignments
} = require('../src/plugins/connector-comfyui/workflow.ts')

function imageFile(name, content = name) {
  return {
    data: Uint8Array.from(Buffer.from(content)).buffer,
    mime: 'image/png',
    filename: name
  }
}

function loadImageNode(image = 'original.png') {
  return {
    class_type: 'LoadImage',
    inputs: { image }
  }
}

test('placeholder prompt injection preserves control characters and JSON validity', () => {
  const prompt = '第一行\n第二行\r\n"quoted" \\ path\tend\u0000'
  const workflow = {
    '1': {
      class_type: 'CR Prompt Text',
      inputs: {
        prompt: 'prefix {{prompt}} suffix',
        repeated: '{{prompt}} / {{prompt}}'
      }
    },
    '{{prompt}}': { value: 7 }
  }

  const result = injectPromptIntoWorkflow(workflow, prompt)

  assert.equal(result.mode, 'placeholder')
  assert.equal(result.replacementCount, 3)
  assert.equal(result.workflow['1'].inputs.prompt, `prefix ${prompt} suffix`)
  assert.equal(result.workflow['1'].inputs.repeated, `${prompt} / ${prompt}`)
  assert.deepEqual(result.workflow['{{prompt}}'], { value: 7 })
  assert.deepEqual(JSON.parse(JSON.stringify(result.workflow)), result.workflow)
})

test('prompt node mode supports text and prompt inputs', () => {
  const textWorkflow = {
    '45': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['1', 0] } }
  }
  const textResult = injectPromptIntoWorkflow(textWorkflow, '人物说明', '45')
  assert.equal(textResult.nodeId, '45')
  assert.equal(textResult.inputName, 'text')
  assert.equal(textWorkflow['45'].inputs.text, '人物说明')

  const promptWorkflow = {
    '8': { class_type: 'CustomText', inputs: { prompt: '' } }
  }
  const promptResult = injectPromptIntoWorkflow(promptWorkflow, 'custom prompt', '8')
  assert.equal(promptResult.inputName, 'prompt')
  assert.equal(promptWorkflow['8'].inputs.prompt, 'custom prompt')
})

test('prompt injection automatically finds a writable CLIPTextEncode node', () => {
  const workflow = {
    '1': { class_type: 'OtherNode', inputs: { text: '' } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: '' } }
  }

  const result = injectPromptIntoWorkflow(workflow, 'auto')
  assert.equal(result.nodeId, '2')
  assert.equal(workflow['2'].inputs.text, 'auto')
})

test('invalid prompt node configuration fails explicitly', () => {
  assert.throws(
    () => injectPromptIntoWorkflow({}, 'prompt', '404'),
    /Prompt 节点不存在：404/
  )
  assert.throws(
    () => injectPromptIntoWorkflow({ '1': { class_type: 'Node', inputs: { value: 1 } } }, 'prompt', '1'),
    /没有可写入的 text 或 prompt/
  )
  assert.throws(
    () => injectPromptIntoWorkflow({ '1': { class_type: 'Node', inputs: {} } }, 'prompt'),
    /未找到 \{\{prompt\}\} 占位符/
  )
})

test('pre-applied mode preserves nested prompt data and ignores legacy node markers', () => {
  const timeline = JSON.stringify({
    global_prompt: 'line one\n"quoted" \\ path',
    segments: [{ prompt: 'local prompt' }]
  })
  const workflow = {
    '1': {
      class_type: 'PreparedDirector',
      inputs: { timeline_data: timeline }
    }
  }

  const result = applyPromptInjectionMode(
    workflow,
    'must not replace prepared content',
    '__legacy_prompt_already_applied__',
    'pre-applied'
  )

  assert.equal(result.mode, 'pre-applied')
  assert.equal(result.workflow, workflow)
  assert.equal(result.workflow['1'].inputs.timeline_data, timeline)
  assert.deepEqual(JSON.parse(result.workflow['1'].inputs.timeline_data), {
    global_prompt: 'line one\n"quoted" \\ path',
    segments: [{ prompt: 'local prompt' }]
  })
})

test('prompt injection mode defaults to strict injection and rejects invalid values', () => {
  assert.throws(
    () => applyPromptInjectionMode({}, 'prompt', '__missing__'),
    /Prompt 节点不存在：__missing__/
  )
  assert.throws(
    () => applyPromptInjectionMode({}, 'prompt', undefined, 'skip'),
    /提示词注入模式无效/
  )
})

test('image count accepts only integers from zero to three', () => {
  assert.equal(normalizeImageCount(0), 0)
  assert.equal(normalizeImageCount('2'), 2)
  assert.equal(normalizeImageCount(3), 3)
  for (const value of [-1, 4, 1.5, '', 'two', undefined]) {
    assert.throws(() => normalizeImageCount(value), /接受图片数量配置无效/)
  }
})

test('explicit image mapping preserves file order', () => {
  const first = imageFile('preset.png')
  const second = imageFile('character.png')
  const workflow = {
    '25': loadImageNode(),
    '33': loadImageNode()
  }

  const plan = planImageAssignments(workflow, [first, second], 2, ['33', '25'])
  assert.deepEqual(plan.imageFiles, [first, second])
  assert.deepEqual(plan.nodeIds, ['33', '25'])

  assignUploadedImages(workflow, plan.nodeIds, ['uploaded-first.png', 'uploaded-second.png'])
  assert.equal(workflow['33'].inputs.image, 'uploaded-first.png')
  assert.equal(workflow['25'].inputs.image, 'uploaded-second.png')
})

test('missing explicit slots fall back to unused LoadImage nodes', () => {
  const workflow = {
    '10': loadImageNode(),
    '20': loadImageNode(),
    '30': loadImageNode()
  }
  const files = [imageFile('one.png'), imageFile('two.png'), imageFile('three.png')]

  const plan = planImageAssignments(workflow, files, 3, ['20', '', undefined])
  assert.deepEqual(plan.nodeIds, ['20', '10', '30'])
})

test('image mismatch and empty image data fail before assignment', () => {
  const workflow = { '1': loadImageNode(), '2': loadImageNode() }
  assert.throws(
    () => planImageAssignments(workflow, [imageFile('one.png'), imageFile('two.png')], 1, ['1']),
    /图片数量不符：需要 1 张，实际提供了 2 张/
  )
  assert.throws(
    () => planImageAssignments(workflow, [imageFile('one.png')], 0, []),
    /图片数量不符：需要 0 张，实际提供了 1 张/
  )
  assert.throws(
    () => planImageAssignments(workflow, [{ data: new ArrayBuffer(0), mime: 'image/png', filename: 'empty.png' }], 1, ['1']),
    /第 1 张图片内容为空/
  )
})

test('invalid, duplicate, and insufficient LoadImage mappings fail explicitly', () => {
  const files = [imageFile('one.png'), imageFile('two.png')]
  assert.throws(
    () => planImageAssignments({ '1': loadImageNode() }, [files[0]], 1, ['404']),
    /输入节点不存在：404/
  )
  assert.throws(
    () => planImageAssignments({ '1': { class_type: 'OtherNode', inputs: { image: '' } } }, [files[0]], 1, ['1']),
    /不是有效的 LoadImage 节点/
  )
  assert.throws(
    () => planImageAssignments({ '1': loadImageNode() }, files, 2, ['1', '1']),
    /图片输入节点重复配置：1/
  )
  assert.throws(
    () => planImageAssignments({ '1': loadImageNode() }, files, 2, ['1', '']),
    /无法为第 2 张图片找到可用的 LoadImage 节点/
  )
  assert.throws(
    () => assignUploadedImages({ '1': loadImageNode() }, ['1'], []),
    /图片上传结果数量不符/
  )
})
