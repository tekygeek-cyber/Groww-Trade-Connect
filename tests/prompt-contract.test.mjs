import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const raw=readFileSync('docs/prompts/Groww_Connect_One_Shot_AI_Harness.html','utf8');
const markdown=readFileSync('docs/prompts/Groww_Connect_One_Shot_AI_Harness.md','utf8');
const blueprint=readFileSync('docs/AI_HARNESS_ARCHITECTURE_BLUEPRINT.md','utf8');
const match=raw.match(/<div class="prompt" id="oneShotPrompt">([\s\S]*?)<\/div>/);
const decoded=text=>text.replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&#39;',"'");

test('HTML retains the source prompt and working copy button handler',()=>{
  assert.ok(match,'copyable oneShotPrompt not found');
  assert.match(raw,/function copyPrompt\(\)/);
  assert.match(raw,/navigator\.clipboard\.writeText\(text\)/);
});
test('markdown preserves full HTML prompt without editorial rewriting',()=>{
  const prompt=decoded(match[1].trim());
  assert.ok(prompt.length>25000,'master prompt was truncated');
  const separator='\n---\n\n';
  const extracted=markdown.slice(markdown.indexOf(separator)+separator.length).trim();
  assert.equal(extracted,prompt);
});
test('nineteen required architecture sections remain present',()=>{
  for(let n=1;n<=19;n++){
    assert.ok(new RegExp('^'+n+'\\. [A-Z]', 'm').test(match[1]),'missing section '+n);
  }
});
test('safety invariant clauses are retained in both prompt and blueprint',()=>{
  for(const text of [
    'The LLM proposes actions. The harness validates and executes them.',
    'Use Ajv with allErrors: true and additionalProperties: false.',
    'Live trading requires explicit human approval.',
    'The Risk & Compliance Gate is not an AI agent.',
  ]){
    assert.ok(match[1].includes(text),text);
  }
  assert.match(blueprint,/live trading.*unavailable/i);
  assert.match(blueprint,/server\/security-policy\.mjs/);
});
