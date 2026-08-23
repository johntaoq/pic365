import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_IMAGE_PROMPT_OPTIMIZER_MODEL,
  IMAGE_PROMPT_OPTIMIZER_SYSTEM_PROMPT
} from '../shared/image-prompt-optimizer.js';

test('AI magic defaults to Luna and requests professional visual direction', () => {
  assert.equal(DEFAULT_IMAGE_PROMPT_OPTIMIZER_MODEL, 'gpt-5.6-luna');
  assert.match(IMAGE_PROMPT_OPTIMIZER_SYSTEM_PROMPT, /senior visual director/i);
  assert.match(IMAGE_PROMPT_OPTIMIZER_SYSTEM_PROMPT, /composition.*camera viewpoint.*lens.*lighting.*materials/i);
  assert.match(IMAGE_PROMPT_OPTIMIZER_SYSTEM_PROMPT, /Return only one final optimized image prompt/i);
});

test('AI magic reduces benign false positives without teaching filter evasion', () => {
  assert.match(IMAGE_PROMPT_OPTIMIZER_SYSTEM_PROMPT, /Reduce false positives/i);
  assert.match(IMAGE_PROMPT_OPTIMIZER_SYSTEM_PROMPT, /complete visual intent and context/i);
  assert.match(IMAGE_PROMPT_OPTIMIZER_SYSTEM_PROMPT, /not a filter-evasion or moderation-bypass task/i);
  assert.match(IMAGE_PROMPT_OPTIMIZER_SYSTEM_PROMPT, /Never use code words, misspellings, translations, euphemisms, encoded text/i);
  assert.match(IMAGE_PROMPT_OPTIMIZER_SYSTEM_PROMPT, /never disguise a disallowed core intent/i);
});
