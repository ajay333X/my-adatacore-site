const test = require('node:test');
const assert = require('node:assert/strict');
const knowledge = require('../coreforge-knowledge.js');

test('retrieval finds business-specific facts', () => {
  const docs = [{label:'academy.txt', text:'Foundation Mathematics costs ₹4000 and lasts eight weeks. The office closes on Sundays.'}];
  const result = knowledge.contextFor('What does Foundation Mathematics cost?', docs);
  assert.ok(result.hits.length > 0);
  assert.match(result.context, /₹4000/);
  assert.match(result.context, /academy\.txt-1/);
});
test('retrieval does not fabricate citations for unrelated topics', () => {
  const docs = [{label:'academy.txt', text:'The office is closed Sundays.'}];
  assert.equal(knowledge.search('scholarship eligibility', docs).length, 0);
});
test('chunking constrains document length', () => {
  const out = knowledge.chunks('A'.repeat(140000), 'test');
  assert.ok(out.length <= 180);
  assert.ok(out.every(x=>x.text.length<=850));
});
