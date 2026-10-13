import assert from 'node:assert/strict'
import { renderMd } from '../src/lib/audition-format.ts'

assert.equal(renderMd('**bold** and *italic*'), '<strong>bold</strong> and <em>italic</em>')
assert.equal(
  renderMd('[theater](https://example.com/tickets?a=1&b=2)'),
  '<a href="https://example.com/tickets?a=1&amp;b=2" target="_blank" rel="noopener">theater</a>'
)
assert.equal(
  renderMd('**first**\n- *second*\n- [third](https://example.com)'),
  '<strong>first</strong>\n<ul class="md-list" style="margin:0.4em 0;padding-left:1.4em;white-space:normal"><li><em>second</em></li><li><a href="https://example.com" target="_blank" rel="noopener">third</a></li></ul>'
)
assert.equal(renderMd('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;')
assert.equal(renderMd('[unsafe](javascript:alert(1))'), '[unsafe](javascript:alert(1))')
assert.equal(
  renderMd('[unsafe](https://example.com/" onmouseover="x)'),
  '<a href="https://example.com/&quot; onmouseover=&quot;x" target="_blank" rel="noopener">unsafe</a>'
)

console.log('Markdown formatting checks passed.')
